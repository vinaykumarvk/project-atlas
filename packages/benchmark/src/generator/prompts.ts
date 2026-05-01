import { Difficulty } from './templates';

export const SYSTEM_PROMPT = `You are a synthetic data generator for Bajaj Housing Finance Corporation's email classification system (Project Atlas).

CONTEXT:
- Bajaj Housing Finance Corporation is one of India's largest housing finance companies
- They handle collateral operations (property valuation, legal opinions, title searches, insurance, release of collateral)
- Stakeholders include: Branch Managers, Field Process Representatives (FPRs), Valuers, Legal Advocates, Insurance companies, Customers
- Operations span across India with regional language mixing (Hindi-English "Hinglish" is common)
- Loan account numbers follow pattern: LN-XXXX-YYYY or LNXXXXYYYY
- Internal reference numbers: ATL-YYYY-NNNNNN
- Currency: INR (₹, Rs.)
- Common cities: Mumbai, Pune, Delhi, Bangalore, Chennai, Hyderabad, Kolkata, Ahmedabad, Jaipur

ENTITY TYPES TO INCLUDE:
- loan_account_no: LN-XXXX-YYYY format
- customer_name: Indian names (Mr./Mrs./Ms. prefix)
- property_pin: 6-digit Indian PIN code
- property_city: Indian city names
- monetary_amount: Rs./₹/INR amounts
- due_date: Dates in DD-MMM-YYYY or DD/MM/YYYY format
- contact_phone: +91XXXXXXXXXX format
- vendor_name: Valuation/legal firm names
- reference_number: ATL-YYYY-NNNNNN format

OUTPUT FORMAT:
Return a JSON object with an "emails" array. Each email object must have:
{
  "subject": "email subject line",
  "body": "full email body text",
  "thread_context": "previous thread messages if applicable, or null",
  "ground_truth_entities": [
    { "entity_type": "loan_account_no", "value": "LN-1234-5678" },
    ...
  ],
  "sender_persona": "role of sender",
  "geography": "city/region",
  "tone": "formal|informal|urgent|polite|frustrated|neutral",
  "expected_sentiment": "positive|negative|neutral|mixed",
  "expected_urgency_signal": "HIGH|MEDIUM|LOW|NONE"
}`;

export const CATEGORY_PROMPTS: Record<string, string> = {
  VALUATION_REQUEST: `Generate emails requesting property valuation services.
Topics: new valuation requests, valuation report follow-ups, re-valuation requests, valuation fee queries.
Must include: loan account number, property address/city, customer name.
May include: property type, estimated value, preferred valuer, urgency.
Keywords: valuation, property valuation, valuation report, appraisal, market value, site inspection.`,

  LEGAL_OPINION: `Generate emails related to legal opinion requests and legal matters.
Topics: title verification requests, legal opinion reports, encumbrance checks, litigation status updates.
Must include: loan account number, property details, advocate/law firm name.
May include: court case numbers, hearing dates, legal fees, document list.
Keywords: legal opinion, advocate, title clear, encumbrance, litigation, court order, legal vetting.`,

  TITLE_SEARCH: `Generate emails about title search and property ownership verification.
Topics: title search initiation, title report submission, ownership chain queries, revenue records.
Must include: property details, customer name, loan reference.
May include: survey numbers, registration details, mutation records.
Keywords: title search, title clear, title deed, ownership, revenue records, mutation, registration.`,

  INSURANCE_RENEWAL: `Generate emails about property insurance and renewal.
Topics: insurance renewal reminders, policy expiry alerts, premium payment confirmations, claim status.
Must include: loan account number, policy number or reference, due date.
May include: premium amount, insurance company name, coverage details.
Keywords: insurance, renewal, premium, policy, coverage, expiry, fire insurance, property insurance.`,

  RELEASE_OF_COLLATERAL: `Generate emails requesting release of collateral/security after loan closure.
Topics: NOC requests, release of charge, original document return, lien removal.
Must include: loan account number, customer name, reference number.
May include: loan closure date, outstanding amount (should be zero/nil), branch details.
Keywords: release, collateral, NOC, no objection, release of charge, original documents, lien removal, loan closure.`,

  SITE_VISIT: `Generate emails about physical site visits and property inspections.
Topics: site visit scheduling, visit report submissions, re-inspection requests, access issues.
Must include: property address/location, visit date, customer/contact details.
May include: FPR name, photographs reference, construction stage, occupancy status.
Keywords: site visit, inspection, field visit, physical verification, survey, construction status, occupancy.`,

  DOCUMENT_COLLECTION: `Generate emails about collecting/submitting documents.
Topics: pending document requests, document submission confirmations, incomplete file alerts, checklist follow-ups.
Must include: loan account number, customer name, document types needed.
May include: submission deadline, branch details, courier/pickup references.
Keywords: document, documents required, pending documents, submission, collect, checklist, missing documents.`,

  GENERAL_INQUIRY: `Generate emails with general queries not specific to the above categories.
Topics: status inquiries, process questions, system access requests, general feedback, escalations.
Must include: some form of reference (loan number or case number).
May include: contact details, timeline queries, complaint details.
Keywords: query, information, status, update, help, clarification, process, timeline.`,

  MULTI_INTENT: `Generate emails that contain MULTIPLE distinct requests spanning different categories.
For example: an email asking for both a valuation update AND an insurance renewal reminder.
Or: a document collection request that also mentions scheduling a site visit.
The ground_truth_label should be set to the PRIMARY intent (the first/most prominent one).
Include a variation_tag "multi_intent" in your thinking.
Make it genuinely ambiguous which category should be primary.`,

  NOISE: `Generate emails that do NOT belong to any of the 8 operational categories.
Types: Out-of-Office auto-replies, spam, newsletter subscriptions, personal emails accidentally sent, vendor marketing, internal HR communications, IT system alerts, holiday greetings.
The ground_truth_label should be "GENERAL_INQUIRY" (closest catch-all).
These should be clearly NOT about collateral operations.`,
};

export const DIFFICULTY_INSTRUCTIONS: Record<Difficulty, string> = {
  EASY: `EASY difficulty:
- Clear, unambiguous language
- Explicit category keywords present in subject and body
- All entities clearly stated with standard formatting
- Standard formal email structure
- Single intent, no distractions
- English only (no code-mixing)`,

  MEDIUM: `MEDIUM difficulty:
- Slightly indirect language, but intent is still clear
- Some entities may have non-standard formatting (e.g., "Loan no 1234-5678" instead of "LN-1234-5678")
- May include some Hinglish phrases (e.g., "Please jaldi karo" = "Please do it quickly")
- Could be a forwarded email with some extra noise
- One variation from: informal tone, abbreviations, minor typos`,

  HARD: `HARD difficulty:
- Indirect or implied intent (reader must infer the category)
- Heavy Hinglish or regional language mixing
- Long forwarded chains where the real request is buried
- Multiple topics mentioned but one is primary
- Entities partially obscured or in non-standard formats
- May reference attachments that "explain everything"
- Frustrated or emotional tone that obscures the actual request
- Apply 2-3 variations: hinglish, forwarded_chain, typos, informal, abbreviated`,

  ADVERSARIAL: `ADVERSARIAL difficulty:
- Deliberately misleading keywords (e.g., mentions "valuation" but is actually about insurance)
- Category-crossing language designed to confuse classifiers
- Extremely informal with heavy abbreviations and slang
- Multi-intent with no clear primary category
- Very short emails (1-2 lines) with minimal context
- Or very long rambling emails where intent is buried deep
- Non-standard structures (bullet lists, tables in text, SMS-style)
- Apply 3+ variations to maximize confusion`,
};

export function buildGenerationPrompt(
  category: string,
  difficulty: Difficulty,
  count: number,
  batchIndex: number,
): string {
  const categoryPrompt = CATEGORY_PROMPTS[category] || CATEGORY_PROMPTS.GENERAL_INQUIRY;
  const difficultyInstructions = DIFFICULTY_INSTRUCTIONS[difficulty];

  return `Generate exactly ${count} synthetic emails for category: ${category}

${categoryPrompt}

${difficultyInstructions}

REQUIREMENTS:
- Each email must be unique and realistic
- Vary sender personas, geographies, and specific details
- Batch index ${batchIndex} — ensure no duplicates with other batches
- Include at least 2-3 entities per email (more for EASY, fewer for ADVERSARIAL)
- For HARD/ADVERSARIAL: include variation tags describing what makes it challenging
- ground_truth_label must be "${category}" for all emails in this batch
${category === 'MULTI_INTENT' ? '- Exception: for MULTI_INTENT, set ground_truth_label to the PRIMARY category' : ''}
${category === 'NOISE' ? '- Exception: for NOISE, set ground_truth_label to "GENERAL_INQUIRY"' : ''}

Return valid JSON with the "emails" array containing exactly ${count} email objects.`;
}
