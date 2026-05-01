import { Injectable } from '@nestjs/common';
import { EmailInput, LlmClassificationResult } from '../types';

/**
 * Interface for LLM-based classification providers.
 * Real implementations would call Azure OpenAI or AWS Bedrock.
 */
export interface LlmClassifierProvider {
  classify(
    email: EmailInput,
    labels: string[],
  ): Promise<LlmClassificationResult[]>;
}

/**
 * Mock LLM classifier implementation.
 * Simulates LLM-based classification with keyword analysis and rationale generation.
 */
@Injectable()
export class MockLlmClassifier implements LlmClassifierProvider {
  private readonly labelKeywords: Record<string, { keywords: string[]; rationale: string }> = {
    VALUATION_REQUEST: {
      keywords: ['valuation', 'property valuation', 'valuation report', 'market value', 'appraisal'],
      rationale: 'Email requests property valuation or contains valuation-related discussion.',
    },
    LEGAL_OPINION: {
      keywords: ['legal opinion', 'legal', 'advocate', 'court order', 'litigation', 'dispute'],
      rationale: 'Email pertains to legal matters, opinion requests, or court-related proceedings.',
    },
    TITLE_SEARCH: {
      keywords: ['title', 'title search', 'title clearance', 'ownership', 'title deed', 'encumbrance'],
      rationale: 'Email relates to title verification, ownership search, or property title matters.',
    },
    INSURANCE_RENEWAL: {
      keywords: ['insurance', 'renewal', 'premium', 'policy', 'coverage', 'expiry'],
      rationale: 'Email concerns insurance policy renewal, premium payment, or coverage updates.',
    },
    RELEASE_OF_COLLATERAL: {
      keywords: ['release', 'collateral', 'noc', 'no objection', 'charge release', 'satisfaction'],
      rationale: 'Email requests release of collateral security or NOC issuance.',
    },
    SITE_VISIT: {
      keywords: ['site visit', 'inspection', 'field visit', 'physical verification', 'survey', 'visit scheduled'],
      rationale: 'Email relates to scheduling or reporting on a physical site inspection.',
    },
    DOCUMENT_COLLECTION: {
      keywords: ['document', 'collect', 'documents required', 'pending documents', 'submission', 'paperwork'],
      rationale: 'Email pertains to collection, submission, or follow-up on required documents.',
    },
    GENERAL_INQUIRY: {
      keywords: ['query', 'information', 'status', 'update', 'enquiry', 'clarification'],
      rationale: 'General inquiry or status request that does not fit specific case types.',
    },
  };

  async classify(
    email: EmailInput,
    labels: string[],
  ): Promise<LlmClassificationResult[]> {
    // Simulate network latency
    await this.simulateLatency();

    const text = `${email.subject} ${email.body}`.toLowerCase();
    const results: LlmClassificationResult[] = [];

    for (const label of labels) {
      const config = this.labelKeywords[label];
      if (!config) continue;

      let matchCount = 0;
      for (const keyword of config.keywords) {
        if (text.includes(keyword)) {
          matchCount++;
        }
      }

      if (matchCount > 0) {
        const confidence = Math.min(0.95, 0.5 + matchCount * 0.15 + (Math.random() - 0.5) * 0.05);
        results.push({
          label,
          confidence,
          rationale: config.rationale,
        });
      }
    }

    // If no matches, return a general inquiry result
    if (results.length === 0) {
      results.push({
        label: 'GENERAL_INQUIRY',
        confidence: 0.6 + (Math.random() - 0.5) * 0.1,
        rationale: 'No specific category keywords detected. Classified as general inquiry.',
      });
    }

    // Sort by confidence descending
    results.sort((a, b) => b.confidence - a.confidence);

    return results;
  }

  private simulateLatency(): Promise<void> {
    // Simulate 50-150ms latency
    const delay = 50 + Math.random() * 100;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}

/**
 * Placeholder for Azure OpenAI LLM classifier.
 * Would integrate with Azure OpenAI Service in production.
 */
@Injectable()
export class AzureOpenAiClassifier implements LlmClassifierProvider {
  async classify(
    email: EmailInput,
    labels: string[],
  ): Promise<LlmClassificationResult[]> {
    // In production, this would:
    // 1. Construct a prompt with the email content and available labels
    // 2. Call Azure OpenAI API (GPT-4) with structured output
    // 3. Parse the response into LlmClassificationResult[]
    // 4. Handle rate limits, timeouts, and token budget

    throw new Error(
      'AzureOpenAiClassifier is not configured. Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_KEY environment variables.',
    );
  }
}

/**
 * Placeholder for AWS Bedrock LLM classifier.
 * Would integrate with AWS Bedrock (Claude/Titan) in production.
 */
@Injectable()
export class BedrockClassifier implements LlmClassifierProvider {
  async classify(
    email: EmailInput,
    labels: string[],
  ): Promise<LlmClassificationResult[]> {
    // In production, this would:
    // 1. Construct a prompt using Bedrock's API format
    // 2. Invoke the model (e.g., Claude on Bedrock)
    // 3. Parse structured output
    // 4. Handle throttling and error recovery

    throw new Error(
      'BedrockClassifier is not configured. Set AWS_BEDROCK_REGION and model ARN environment variables.',
    );
  }
}
