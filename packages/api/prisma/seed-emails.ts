import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

// ============ TEMPLATES ============

const CASE_TYPES = [
  'VALUATION_REQUEST',
  'LEGAL_OPINION',
  'TITLE_SEARCH',
  'INSURANCE_RENEWAL',
  'RELEASE_OF_COLLATERAL',
  'SITE_VISIT',
  'DOCUMENT_COLLECTION',
  'GENERAL_INQUIRY',
];

const PRIORITIES = ['LOW', 'NORMAL', 'NORMAL', 'NORMAL', 'HIGH', 'HIGH', 'CRITICAL'];

const STATUSES = ['NEW', 'CLASSIFIED', 'ROUTED', 'IN_PROGRESS', 'AWAITING_FPR', 'REVIEW', 'RESOLVED', 'CLOSED'];

const CONFIDENCE_BANDS = ['GREEN', 'GREEN', 'GREEN', 'AMBER', 'AMBER', 'RED'];

const SENTIMENTS = ['NEUTRAL', 'NEUTRAL', 'POSITIVE', 'NEGATIVE', 'URGENT'];

const CITIES = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad', 'Pune', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Lucknow'];

const REGIONS = ['NORTH', 'SOUTH', 'EAST', 'WEST'];

const SENDER_DOMAINS = ['hdfc.com', 'icici.com', 'sbi.co.in', 'axisbank.com', 'kotak.com', 'pnb.co.in', 'yesbank.in', 'idfc.com'];

const FIRST_NAMES = ['Rahul', 'Priya', 'Amit', 'Sneha', 'Vikram', 'Anita', 'Suresh', 'Deepa', 'Rajesh', 'Kavita', 'Arun', 'Meera', 'Sanjay', 'Pooja', 'Nitin'];
const LAST_NAMES = ['Sharma', 'Patel', 'Kumar', 'Singh', 'Gupta', 'Reddy', 'Nair', 'Verma', 'Joshi', 'Mehta', 'Iyer', 'Das', 'Rao', 'Pillai', 'Bhat'];

const SUBJECT_TEMPLATES: Record<string, string[]> = {
  VALUATION_REQUEST: [
    'Valuation Request for Property at {address}',
    'Property Valuation Required - Loan #{loanNo}',
    'Urgent: Valuation needed for collateral assessment at {city}',
    'Re: Property valuation pending - {customerName}',
    'FW: Valuation report required for {address}',
  ],
  LEGAL_OPINION: [
    'Legal Opinion Required - Property Title #{caseRef}',
    'Title Verification Request for {address}',
    'Legal Review: Mortgage Documentation - {customerName}',
    'Urgent Legal Opinion needed - Loan #{loanNo}',
    'Re: Pending legal clearance - {city} property',
  ],
  TITLE_SEARCH: [
    'Title Search Request - {address}',
    'Property Title Verification Needed - #{loanNo}',
    'Encumbrance Certificate Required - {city}',
    'Title due diligence for {customerName}',
    'Re: Pending title search - property at {address}',
  ],
  INSURANCE_RENEWAL: [
    'Insurance Renewal Due - Policy #{caseRef}',
    'Collateral Insurance Expiring - Loan #{loanNo}',
    'Urgent: Insurance lapsed for {address}',
    'Insurance renewal reminder - {customerName}',
    'Re: Property insurance renewal pending',
  ],
  RELEASE_OF_COLLATERAL: [
    'Release of Collateral Request - Loan #{loanNo}',
    'NOC Required - Loan Closure for {customerName}',
    'Collateral Release: Property at {address}',
    'Urgent: Release documents pending - #{caseRef}',
    'Loan prepayment - collateral release needed',
  ],
  SITE_VISIT: [
    'Site Visit Required - {address}',
    'Field Inspection Request - Loan #{loanNo}',
    'Property inspection needed at {city}',
    'Re: Pending site visit for {customerName}',
    'Urgent: Construction progress verification needed',
  ],
  DOCUMENT_COLLECTION: [
    'Document Collection Pending - {customerName}',
    'Missing Documents - Loan #{loanNo}',
    'Required: Original title deed for {address}',
    'Document submission reminder - #{caseRef}',
    'FW: Incomplete documentation - {city} branch',
  ],
  GENERAL_INQUIRY: [
    'Query regarding loan status - #{loanNo}',
    'General inquiry - collateral process',
    'Question about property valuation timeline',
    'Follow-up: Case #{caseRef} status update',
    'Information request - {customerName} account',
  ],
};

const BODY_TEMPLATES: Record<string, string[]> = {
  VALUATION_REQUEST: [
    `Dear Collateral Team,\n\nPlease arrange for a valuation of the property located at {address}.\n\nLoan Account: {loanNo}\nCustomer: {customerName}\nProperty Type: Residential Flat\nArea: {area} sq ft\n\nThe valuation report is required for the sanctioning process. Please ensure the report is submitted within the TAT.\n\nRegards,\n{senderName}\n{senderDept}`,
    `Hi Team,\n\nRe-valuation required for the below property as part of annual collateral review:\n\nAddress: {address}\nLoan No: {loanNo}\nLast Valuation Date: {pastDate}\nCurrent Market Value (estimated): INR {amount}\n\nPlease coordinate with empanelled valuers and share the updated report.\n\nThanks,\n{senderName}`,
  ],
  LEGAL_OPINION: [
    `Dear Legal Team,\n\nWe require a legal opinion for the following property being offered as collateral:\n\nProperty: {address}\nOwner: {customerName}\nLoan Account: {loanNo}\n\nPlease verify:\n1. Clear title and ownership chain\n2. No pending litigations\n3. All statutory approvals in place\n4. Encumbrance status\n\nDeadline: {futureDate}\n\nRegards,\n{senderName}`,
    `Team,\n\nUrgent legal review needed for mortgage documentation.\n\nBorrower: {customerName}\nProperty at: {address}\nLoan amount: INR {amount}\n\nThe customer wants quick disbursal. Please expedite the title search and legal opinion.\n\nThanks,\n{senderName}\n{senderDept}`,
  ],
  TITLE_SEARCH: [
    `Hi,\n\nPlease initiate a title search for the below property:\n\nAddress: {address}\nSurvey No: {pin}\nCity: {city}\nOwner: {customerName}\n\nWe need the encumbrance certificate for the last 30 years and verification of the chain of title.\n\nLoan Ref: {loanNo}\n\nRegards,\n{senderName}`,
  ],
  INSURANCE_RENEWAL: [
    `Dear Team,\n\nThe property insurance for the following collateral is due for renewal:\n\nLoan: {loanNo}\nCustomer: {customerName}\nProperty: {address}\nCurrent Policy Expiry: {futureDate}\nSum Insured: INR {amount}\n\nPlease ensure renewal is processed before expiry to maintain collateral coverage.\n\nRegards,\n{senderName}`,
  ],
  RELEASE_OF_COLLATERAL: [
    `Dear Collateral Operations,\n\nLoan account {loanNo} has been fully repaid. Please initiate the release of collateral documents.\n\nCustomer: {customerName}\nProperty: {address}\nLoan Closure Date: {pastDate}\n\nDocuments to be released:\n1. Original Title Deed\n2. Sale Agreement\n3. NOC from Society\n\nPlease process within 15 working days as per RBI guidelines.\n\nRegards,\n{senderName}`,
  ],
  SITE_VISIT: [
    `Hi Team,\n\nPlease arrange a site visit for the following property:\n\nAddress: {address}\nCity: {city}\nLoan: {loanNo}\nCustomer: {customerName}\nPurpose: Construction progress verification\n\nThe FPR should verify current construction stage and take geo-tagged photographs.\n\nThanks,\n{senderName}`,
  ],
  DOCUMENT_COLLECTION: [
    `Dear {customerName},\n\nThis is a reminder that the following documents are still pending for your loan account {loanNo}:\n\n1. Original Sale Deed\n2. Property Tax Receipt (current year)\n3. Society NOC\n4. Insurance Policy Copy\n\nPlease submit these at the earliest to avoid delays in processing.\n\nRegards,\n{senderName}\nCollateral Operations\n{city} Branch`,
  ],
  GENERAL_INQUIRY: [
    `Hi Team,\n\nCould you please provide an update on case #{caseRef}?\n\nThe customer {customerName} has been following up regarding the status of their collateral documentation.\n\nLoan: {loanNo}\nProperty: {address}\n\nPlease share the current status.\n\nThanks,\n{senderName}`,
  ],
};

// ============ HELPERS ============

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateLoanNo(): string {
  return `LN${randomInt(1000000, 9999999)}`;
}

function generateCaseRef(): string {
  return `CR-${randomInt(10000, 99999)}`;
}

function generateAddress(city: string): string {
  const nums = randomInt(1, 500);
  const streets = ['MG Road', 'Park Street', 'Station Road', 'Ring Road', 'Lake View', 'Hill Top', 'Garden Lane', 'Temple Street', 'Market Road', 'Civil Lines'];
  const areas = ['Sector ' + randomInt(1, 99), 'Phase ' + randomInt(1, 5), 'Block ' + String.fromCharCode(65 + randomInt(0, 7))];
  return `${nums}, ${randomFrom(streets)}, ${randomFrom(areas)}, ${city}`;
}

function generatePin(): string {
  return String(randomInt(100000, 999999));
}

function pastDate(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d;
}

function futureDate(daysAhead: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d;
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

function generateConfidence(band: string): number {
  switch (band) {
    case 'GREEN': return 0.85 + Math.random() * 0.14; // 0.85 - 0.99
    case 'AMBER': return 0.65 + Math.random() * 0.19; // 0.65 - 0.84
    case 'RED': return 0.40 + Math.random() * 0.24; // 0.40 - 0.64
    default: return 0.75;
  }
}

function generateAlternatives(topLabel: string, topConf: number): { label: string; confidence: number }[] {
  const remaining = 1 - topConf;
  const otherTypes = CASE_TYPES.filter(t => t !== topLabel);
  const alts: { label: string; confidence: number }[] = [];
  let budget = remaining;
  for (let i = 0; i < 3 && budget > 0.01; i++) {
    const conf = Math.min(budget, remaining * (0.5 / (i + 1)));
    alts.push({ label: randomFrom(otherTypes), confidence: Math.round(conf * 1000) / 1000 });
    budget -= conf;
  }
  return alts;
}

function generateEntities(vars: Record<string, string>): Record<string, string | null> {
  return {
    loan_account_no: vars.loanNo || null,
    customer_name: vars.customerName || null,
    property_address: vars.address || null,
    city: vars.city || null,
    pin_code: vars.pin || null,
    amount: vars.amount || null,
  };
}

// ============ MAIN SEED ============

async function main() {
  console.log('Seeding 1000 test emails with cases and AI classification results...\n');

  const TOTAL = 1000;
  const BATCH_SIZE = 50;

  // Check for existing data
  const existingCount = await prisma.emailIngest.count();
  if (existingCount >= 900) {
    console.log(`Database already has ${existingCount} emails. Skipping seed.`);
    return;
  }

  // Get users for assignment
  const users = await prisma.user.findMany({ take: 10 });
  const fprs = await prisma.fprMaster.findMany({ take: 10 });
  const vendors = await prisma.vendorMaster.findMany({ take: 5 });

  const officerId = users.length > 0 ? users[0].id : null;

  let caseCounter = existingCount;
  const year = new Date().getFullYear();

  for (let batch = 0; batch < TOTAL / BATCH_SIZE; batch++) {
    const emailData: any[] = [];
    const caseData: any[] = [];
    const aiData: any[] = [];

    for (let i = 0; i < BATCH_SIZE; i++) {
      caseCounter++;
      const idx = batch * BATCH_SIZE + i;

      // Generate variables
      const caseType = CASE_TYPES[idx % CASE_TYPES.length];
      const city = randomFrom(CITIES);
      const firstName = randomFrom(FIRST_NAMES);
      const lastName = randomFrom(LAST_NAMES);
      const customerName = `${firstName} ${lastName}`;
      const senderFirstName = randomFrom(FIRST_NAMES);
      const senderLastName = randomFrom(LAST_NAMES);
      const senderName = `${senderFirstName} ${senderLastName}`;
      const senderDomain = randomFrom(SENDER_DOMAINS);
      const senderEmail = `${senderFirstName.toLowerCase()}.${senderLastName.toLowerCase()}@${senderDomain}`;
      const loanNo = generateLoanNo();
      const caseRef = generateCaseRef();
      const address = generateAddress(city);
      const pin = generatePin();
      const amount = `${randomInt(10, 500)},${randomInt(0, 99).toString().padStart(2, '0')},000`;
      const area = `${randomInt(500, 3000)}`;

      const vars: Record<string, string> = {
        address, city, customerName, senderName, loanNo, caseRef, pin, amount, area,
        senderDept: 'Credit Department',
        pastDate: pastDate(randomInt(30, 365)).toISOString().split('T')[0],
        futureDate: futureDate(randomInt(7, 60)).toISOString().split('T')[0],
      };

      // Generate email
      const subjectTemplates = SUBJECT_TEMPLATES[caseType] || SUBJECT_TEMPLATES.GENERAL_INQUIRY;
      const bodyTemplates = BODY_TEMPLATES[caseType] || BODY_TEMPLATES.GENERAL_INQUIRY;

      const subject = fillTemplate(randomFrom(subjectTemplates), vars);
      const bodyText = fillTemplate(randomFrom(bodyTemplates), vars);

      const emailId = crypto.randomUUID();
      const caseId = crypto.randomUUID();
      const messageId = `<${crypto.randomUUID()}@${senderDomain}>`;
      const receivedAt = pastDate(randomInt(1, 90));

      const priority = randomFrom(PRIORITIES);
      const confidenceBand = randomFrom(CONFIDENCE_BANDS);
      const status = randomFrom(STATUSES);
      const sentiment = randomFrom(SENTIMENTS);

      const ingestStatus = status === 'NEW' ? 'RECEIVED' : 'CLASSIFIED';

      emailData.push({
        id: emailId,
        message_id: messageId,
        from_address: senderEmail,
        to_addresses: ['collateral.ops@atlas.bank'],
        cc_addresses: idx % 5 === 0 ? ['manager@atlas.bank'] : [],
        subject,
        body_text: bodyText,
        body_html: `<html><body><pre>${bodyText}</pre></body></html>`,
        received_at: receivedAt,
        ingest_status: ingestStatus,
        language_detected: 'en',
        spf_verdict: 'PASS',
        dkim_verdict: 'PASS',
        dmarc_verdict: 'PASS',
        phishing_score: Math.random() * 0.1,
        spam_score: Math.random() * 0.2,
        phishing_flagged: false,
        source_mailbox: idx % 3 === 0 ? 'secondary' : 'primary',
        provider: idx % 4 === 0 ? 'gmail' : 'graph',
        size_bytes: randomInt(2000, 50000),
        legal_hold: false,
        version: 1,
      });

      const caseNumber = `ATL-${year}-${String(caseCounter).padStart(6, '0')}`;

      caseData.push({
        id: caseId,
        case_number: caseNumber,
        email_ingest_id: emailId,
        case_type: caseType,
        priority,
        status,
        confidence_band: confidenceBand,
        requires_human_review: confidenceBand === 'RED' || confidenceBand === 'RED_MANUAL',
        loan_account_no: loanNo,
        customer_name: customerName,
        property_address: address,
        property_pin: pin,
        property_city: city,
        property_geo: `${18 + Math.random() * 10},${72 + Math.random() * 8}`,
        monetary_amount: randomInt(500000, 50000000),
        assigned_officer_id: officerId,
        assigned_fpr_id: fprs.length > 0 ? fprs[idx % fprs.length].id : null,
        assigned_vendor_id: vendors.length > 0 && idx % 4 === 0 ? vendors[idx % vendors.length].id : null,
        routing_rationale: `Auto-routed based on ${caseType} + region ${randomFrom(REGIONS)}`,
        tat_target_at: futureDate(randomInt(1, 14)),
        escalation_level: randomInt(0, 2),
        ai_summary: `${caseType.replace(/_/g, ' ').toLowerCase()} for property at ${address}. Customer: ${customerName}, Loan: ${loanNo}.`,
        sentiment: sentiment === 'URGENT' ? 'NEGATIVE' : sentiment,
        urgency_signal: sentiment === 'URGENT' ? 'HIGH_URGENCY' : null,
        version: 1,
      });

      // AI Classification
      const topConfidence = generateConfidence(confidenceBand);
      const alternatives = generateAlternatives(caseType, topConfidence);
      const entities = generateEntities(vars);

      aiData.push({
        id: crypto.randomUUID(),
        case_id: caseId,
        model_name: 'atlas-classifier',
        model_version: 'v2.1.0',
        llm_mode: idx % 10 === 0 ? 'DEGRADED' : 'ON',
        top_label: caseType,
        top_confidence: Math.round(topConfidence * 1000) / 1000,
        alternatives_json: alternatives,
        rationale_text: `Classified as ${caseType.replace(/_/g, ' ')} based on subject keywords, sender pattern, and entity extraction. Confidence: ${(topConfidence * 100).toFixed(1)}%.`,
        extracted_entities_json: entities,
        validation_outcomes_json: {
          loan_account_no: loanNo ? 'PASS' : 'NOT_FOUND',
          customer_name: 'FUZZY_MATCH',
          property_address: 'PASS',
        },
        sentiment: sentiment === 'URGENT' ? 'NEGATIVE' : sentiment,
        urgency_signal: sentiment === 'URGENT' ? 'HIGH_URGENCY' : null,
        inference_ms: randomInt(120, 2500),
        token_count: randomInt(200, 1500),
      });
    }

    // Insert batch
    await prisma.$transaction(async (tx) => {
      await tx.emailIngest.createMany({ data: emailData });
      await tx.case.createMany({ data: caseData });
      await tx.aiClassificationResult.createMany({ data: aiData });
    });

    const progress = ((batch + 1) * BATCH_SIZE);
    process.stdout.write(`\r  Created ${progress}/${TOTAL} emails + cases + AI results`);
  }

  console.log('\n\nDone! Summary:');
  const emailCount = await prisma.emailIngest.count();
  const caseCount = await prisma.case.count();
  const aiCount = await prisma.aiClassificationResult.count();
  console.log(`  Email Ingests:     ${emailCount}`);
  console.log(`  Cases:             ${caseCount}`);
  console.log(`  AI Classifications: ${aiCount}`);
  console.log(`\nCase type distribution:`);
  for (const ct of CASE_TYPES) {
    const count = await prisma.case.count({ where: { case_type: ct } });
    console.log(`  ${ct.padEnd(25)} ${count}`);
  }
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
