import { getDb } from '../db';
import { buildGenerationPlan, GenerationSpec, Difficulty, VARIATION_TAGS } from './templates';
import { SYSTEM_PROMPT, buildGenerationPrompt } from './prompts';
import { generateBatch, BatchRequest, GeneratedEmail } from './openai-client';
import { computeEntityOffsets } from './ground-truth';
import { v4 as uuidv4 } from 'uuid';

const BATCH_SIZE = 5; // emails per API call

interface GenerateOptions {
  batchId: string;
  count?: number;
  category?: string;
  dryRun?: boolean;
}

export async function runGeneration(options: GenerateOptions): Promise<void> {
  const { batchId, count, category, dryRun } = options;

  // Build plan — scale based on count
  const scale = count ? count / 1000 : 1.0;
  let plan = buildGenerationPlan(scale);

  // Filter by category if specified
  if (category) {
    plan = plan.filter((s) => s.category === category.toUpperCase());
  }

  console.log(`\nGeneration plan for batch "${batchId}":`);
  console.log(`  Total specs: ${plan.length}`);
  console.log(`  Total emails: ${plan.reduce((sum, s) => sum + s.count, 0)}`);

  if (dryRun) {
    console.log('\n[DRY RUN] Generation plan:');
    for (const spec of plan) {
      console.log(`  ${spec.category} / ${spec.difficulty}: ${spec.count} emails`);
    }
    console.log('\nSample prompt:');
    if (plan.length > 0) {
      console.log(buildGenerationPrompt(plan[0].category, plan[0].difficulty, Math.min(plan[0].count, BATCH_SIZE), 0));
    }
    return;
  }

  const db = getDb();

  // Check existing emails for idempotency
  const existing = await db.testEmail.groupBy({
    by: ['groundTruthLabel', 'difficulty'],
    where: { generationBatch: batchId },
    _count: true,
  });

  const existingMap = new Map<string, number>();
  for (const row of existing) {
    existingMap.set(`${row.groundTruthLabel}:${row.difficulty}`, row._count);
  }

  let totalGenerated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const spec of plan) {
    const key = `${spec.category}:${spec.difficulty}`;
    const existingCount = existingMap.get(key) || 0;
    const needed = Math.max(0, spec.count - existingCount);

    if (needed === 0) {
      console.log(`  ✓ ${key}: ${existingCount}/${spec.count} already exist — skipping`);
      totalSkipped += spec.count;
      continue;
    }

    console.log(`  → ${key}: generating ${needed} emails (${existingCount} existing)...`);

    // Split into batches of BATCH_SIZE
    const batches: BatchRequest[] = [];
    let remaining = needed;
    let batchIdx = 0;

    while (remaining > 0) {
      const batchCount = Math.min(remaining, BATCH_SIZE);
      batches.push({
        id: `${spec.category}-${spec.difficulty}-${batchIdx}`,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildGenerationPrompt(spec.category, spec.difficulty, batchCount, batchIdx),
      });
      remaining -= batchCount;
      batchIdx++;
    }

    const results = await generateBatch(batches);

    for (const result of results) {
      if (result.error) {
        console.error(`    ✗ Batch ${result.id} failed: ${result.error}`);
        totalErrors++;
        continue;
      }

      const records = result.emails.map((email) => buildRecord(email, spec, batchId));

      // Batch insert
      for (const record of records) {
        await db.testEmail.create({ data: record as any });
      }

      totalGenerated += result.emails.length;
    }
  }

  console.log(`\nGeneration complete:`);
  console.log(`  Generated: ${totalGenerated}`);
  console.log(`  Skipped (existing): ${totalSkipped}`);
  console.log(`  Errors: ${totalErrors}`);
}

function buildRecord(
  email: GeneratedEmail,
  spec: GenerationSpec,
  batchId: string,
) {
  const fullText = `${email.subject}\n${email.body}`;
  const entities = computeEntityOffsets(fullText, email.ground_truth_entities || []);

  // Determine variation tags based on difficulty
  const variationTags: string[] = [];
  if (spec.difficulty === 'HARD' || spec.difficulty === 'ADVERSARIAL') {
    if (email.body.match(/[ā-ɏ]|karo|aapka|humara|abhi|jaldi/i)) {
      variationTags.push('hinglish');
    }
    if (email.thread_context) {
      variationTags.push('forwarded_chain');
    }
    if (spec.category === 'MULTI_INTENT') {
      variationTags.push('multi_intent');
    }
  }

  // Determine ground truth label
  let groundTruthLabel = spec.category;
  if (spec.category === 'NOISE') {
    groundTruthLabel = 'GENERAL_INQUIRY';
  }

  return {
    id: uuidv4(),
    subject: email.subject,
    body: email.body,
    threadContext: email.thread_context || null,
    groundTruthLabel,
    groundTruthEntities: entities,
    difficulty: spec.difficulty,
    variationTags,
    senderPersona: email.sender_persona || null,
    geography: email.geography || null,
    tone: email.tone || null,
    completeness: spec.difficulty === 'EASY' ? 'complete' : spec.difficulty === 'MEDIUM' ? 'partial' : 'minimal',
    expectedSentiment: email.expected_sentiment || null,
    expectedUrgencySignal: email.expected_urgency_signal || null,
    generationBatch: batchId,
    generationModel: 'gpt-4o',
    generationPromptHash: null,
  };
}
