export interface RawEmail {
  messageId: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  receivedAt: Date;
  headers: Record<string, string>;
  attachments: RawAttachment[];
  rfc822Raw?: Buffer;
}

export interface RawAttachment {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  content: Buffer;
}

export interface IngestResult {
  id: string;
  messageId: string;
  ingestStatus: IngestStatus;
  reason?: string;
  caseId?: string;
  /** FR-002.A2: True if phishing score is in 0.50-0.80 range and flagged for review. */
  phishingFlagged?: boolean;
  /** FR-005.A3: True if the detected language is in the supported languages list. */
  languageSupported?: boolean;
  /** FR-014.A3: ID of the original email ingest record when this is a duplicate. */
  originalEmailIngestId?: string;
}

export enum IngestStatus {
  RECEIVED = 'RECEIVED',
  DUPLICATE = 'DUPLICATE',
  AUTO_REPLY = 'AUTO_REPLY',
  QUARANTINED = 'QUARANTINED',
  PROCESSING = 'PROCESSING',
  CLASSIFIED = 'CLASSIFIED',
  FAILED = 'FAILED',
}

export interface SecurityVerdicts {
  spf: string | null;
  dkim: string | null;
  dmarc: string | null;
  phishingScore: number;
  spamScore: number;
}

export interface ThreadContext {
  threadId?: string;
  previousMessages: string[];
  strippedBody: string;
  isReply: boolean;
  existingCaseId?: string;
  /** FR-004 A4: Only include thread references newer than this date. */
  lookbackCutoff?: Date;
}

export interface MailProvider {
  name: string;
  poll(): Promise<RawEmail[]>;
  markAsRead(messageId: string): Promise<void>;
}
