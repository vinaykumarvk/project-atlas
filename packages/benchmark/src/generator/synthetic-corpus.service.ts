import { createHash } from 'crypto';

export interface SyntheticEmail {
  id: string;
  subject: string;
  body: string;
  caseType: string;
  groundTruthLabel: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  generatedAt: Date;
}

interface CorpusSignature {
  corpusHash: string;
  version: string;
  signedAt: Date;
  emailCount: number;
}

const TEMPLATES: Record<string, { subjects: string[]; bodyPrefixes: string[] }> = {
  VALUATION: {
    subjects: [
      'Valuation Request for Property at {address}',
      'Property Valuation Required - Loan #{loanNo}',
      'Urgent: Valuation needed for collateral assessment',
    ],
    bodyPrefixes: [
      'Dear Team,\n\nPlease arrange for a valuation of the property located at',
      'We require an immediate valuation for the following property:',
      'Kindly process the attached valuation request for property ID',
    ],
  },
  LEGAL: {
    subjects: [
      'Legal Opinion Required - Property Title #{caseNo}',
      'Title Search Request for {address}',
      'Legal Review: Mortgage Documentation',
    ],
    bodyPrefixes: [
      'Dear Legal Team,\n\nPlease provide a legal opinion on the title documents for',
      'We need a comprehensive title search for the following property:',
      'Attached are the property documents requiring legal review for',
    ],
  },
  TECHNICAL: {
    subjects: [
      'Technical Inspection Report - {address}',
      'Structural Assessment Required for Property',
      'Building Compliance Check Request',
    ],
    bodyPrefixes: [
      'Dear Technical Team,\n\nPlease conduct a technical inspection of the property at',
      'A structural assessment is required for the following property:',
      'Please review the building plans and compliance documents for',
    ],
  },
  TITLE_SEARCH: {
    subjects: [
      'Title Search Request - {address}',
      'Property Title Verification Needed',
      'Encumbrance Certificate Required',
    ],
    bodyPrefixes: [
      'Dear Team,\n\nPlease conduct a title search for the property at',
      'We need verification of property title for loan processing:',
      'Kindly obtain the encumbrance certificate for',
    ],
  },
};

export class SyntheticCorpusService {
  generate(count: number, options?: { caseTypes?: string[] }): SyntheticEmail[] {
    const caseTypes = options?.caseTypes || Object.keys(TEMPLATES);
    const emails: SyntheticEmail[] = [];

    for (let i = 0; i < count; i++) {
      const caseType = caseTypes[i % caseTypes.length];
      const template = TEMPLATES[caseType] || TEMPLATES.VALUATION;
      const subjectTemplate = template.subjects[i % template.subjects.length];
      const bodyPrefix = template.bodyPrefixes[i % template.bodyPrefixes.length];

      const address = `${100 + i} Test Street, City-${i % 10}`;
      const loanNo = `LN${String(10000 + i).padStart(8, '0')}`;
      const caseNo = `CASE-${String(i + 1).padStart(6, '0')}`;

      const subject = subjectTemplate
        .replace('{address}', address)
        .replace('{loanNo}', loanNo)
        .replace('{caseNo}', caseNo);

      const body = `${bodyPrefix} ${address}.\n\nLoan Account: ${loanNo}\nCase Reference: ${caseNo}\n\nPlease process this at the earliest.\n\nRegards,\nTest User ${i + 1}`;

      const difficulties: Array<'EASY' | 'MEDIUM' | 'HARD'> = ['EASY', 'MEDIUM', 'HARD'];

      emails.push({
        id: `synthetic-${i + 1}`,
        subject,
        body,
        caseType,
        groundTruthLabel: caseType,
        difficulty: difficulties[i % 3],
        generatedAt: new Date(),
      });
    }

    return emails;
  }

  signCorpus(emails: SyntheticEmail[]): CorpusSignature {
    const content = emails.map(e => `${e.id}|${e.subject}|${e.body}|${e.caseType}`).join('\n');
    const corpusHash = createHash('sha256').update(content).digest('hex');

    return {
      corpusHash,
      version: `v${new Date().toISOString().split('T')[0].replace(/-/g, '.')}`,
      signedAt: new Date(),
      emailCount: emails.length,
    };
  }
}
