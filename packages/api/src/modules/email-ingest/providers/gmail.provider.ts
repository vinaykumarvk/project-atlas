import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { MailProvider, RawEmail, RawAttachment } from '../types';

/**
 * Google OAuth2 JWT token cache entry.
 */
interface TokenCacheEntry {
  accessToken: string;
  expiresAt: number;
}

/**
 * Service account key file structure.
 */
interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

/**
 * Gmail API message list response.
 */
interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

/**
 * Gmail API message detail response.
 */
interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  payload: GmailMessagePart;
  internalDate: string;
}

interface GmailMessagePart {
  partId?: string;
  mimeType: string;
  headers: Array<{ name: string; value: string }>;
  body: { attachmentId?: string; size: number; data?: string };
  parts?: GmailMessagePart[];
  filename?: string;
}

/**
 * Gmail API mail provider (secondary mailbox per FR-155).
 * Uses service account with domain-wide delegation for server-to-server auth.
 */
@Injectable()
export class GmailMailProvider implements MailProvider {
  name = 'gmail';
  private readonly logger = new Logger(GmailMailProvider.name);
  private readonly enabled: boolean;
  private readonly delegatedUser: string;
  private serviceAccountKey: ServiceAccountKey | null = null;
  private tokenCache: TokenCacheEntry | null = null;
  private lastHistoryId: string | null = null;

  constructor(private config: ConfigService) {
    const keyJson = this.config.get<string>('GMAIL_SERVICE_ACCOUNT_KEY', '');
    this.delegatedUser = this.config.get<string>('GMAIL_DELEGATED_USER', '');
    this.enabled = !!keyJson && !!this.delegatedUser;

    if (keyJson) {
      try {
        this.serviceAccountKey = JSON.parse(keyJson);
      } catch {
        this.logger.error('Failed to parse GMAIL_SERVICE_ACCOUNT_KEY JSON');
        this.serviceAccountKey = null;
      }
    }
  }

  /**
   * Create a JWT for Google OAuth2 service account authentication.
   * Uses domain-wide delegation to impersonate the delegated user.
   */
  private createJwt(): string {
    if (!this.serviceAccountKey) {
      throw new Error('Service account key not configured');
    }

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iss: this.serviceAccountKey.client_email,
      sub: this.delegatedUser,
      scope: 'https://www.googleapis.com/auth/gmail.modify',
      aud: this.serviceAccountKey.token_uri || 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    };

    const headerB64 = base64UrlEncode(JSON.stringify(header));
    const payloadB64 = base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${headerB64}.${payloadB64}`;

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signingInput);
    const signature = sign.sign(this.serviceAccountKey.private_key);
    const signatureB64 = base64UrlEncodeBuffer(signature);

    return `${signingInput}.${signatureB64}`;
  }

  /**
   * Exchange the JWT for an OAuth2 access token.
   * Caches the token until 60 seconds before expiry.
   */
  private async getAccessToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt - 60_000) {
      return this.tokenCache.accessToken;
    }

    const jwt = this.createJwt();
    const tokenUrl =
      this.serviceAccountKey?.token_uri || 'https://oauth2.googleapis.com/token';

    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gmail token request failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    this.tokenCache = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };

    this.logger.debug('Acquired new Gmail access token');
    return this.tokenCache.accessToken;
  }

  /**
   * Make an authenticated request to the Gmail API.
   */
  private async gmailRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
    const token = await this.getAccessToken();
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...((options.headers as Record<string, string>) ?? {}),
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gmail API error (${response.status}): ${errText}`);
    }

    if (response.status === 204) {
      return undefined as unknown as T;
    }

    return response.json();
  }

  /**
   * Poll for new unread messages from the Gmail mailbox.
   */
  async poll(): Promise<RawEmail[]> {
    if (!this.enabled) {
      this.logger.debug('Gmail provider not configured, skipping poll');
      return [];
    }

    try {
      this.logger.log('Polling secondary mailbox via Gmail API');
      const messages = await this.pollMailbox();
      const emails: RawEmail[] = [];

      for (const msg of messages) {
        try {
          const email = await this.fetchMessage(msg.id);
          emails.push(email);
        } catch (error) {
          this.logger.error(`Failed to fetch Gmail message ${msg.id}: ${(error as Error).message}`);
        }
      }

      this.logger.log(`Polled ${emails.length} new message(s) from Gmail`);
      return emails;
    } catch (error) {
      this.logger.error(`Gmail poll failed: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Fetch list of new unread messages via Gmail API.
   * Uses q=is:unread with pagination support.
   */
  async pollMailbox(): Promise<Array<{ id: string; threadId: string }>> {
    const messages: Array<{ id: string; threadId: string }> = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        q: 'is:unread in:inbox',
        maxResults: '50',
      });
      if (pageToken) {
        params.set('pageToken', pageToken);
      }

      const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`;
      const response = await this.gmailRequest<GmailListResponse>(url);

      if (response.messages) {
        messages.push(...response.messages);
      }

      pageToken = response.nextPageToken;
    } while (pageToken);

    return messages;
  }

  /**
   * Fetch a full message with attachments from Gmail API.
   * Returns the message mapped to our RawEmail type.
   */
  async fetchMessage(messageId: string): Promise<RawEmail> {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;
    const msg = await this.gmailRequest<GmailMessage>(url);

    // Extract headers into a flat record
    const headers: Record<string, string> = {};
    if (msg.payload.headers) {
      for (const header of msg.payload.headers) {
        headers[header.name.toLowerCase()] = header.value;
      }
    }

    // Extract addresses
    const from = headers['from'] || '';
    const toHeader = headers['to'] || '';
    const ccHeader = headers['cc'] || '';
    const subject = headers['subject'] || '';
    const internetMessageId = headers['message-id'] || `<gmail-${messageId}@gmail.com>`;

    // Parse recipient lists
    const to = parseAddressList(toHeader);
    const cc = parseAddressList(ccHeader);

    // Extract body parts
    const { textBody, htmlBody, attachments: inlineAttachments } = extractBodyParts(msg.payload);

    // Fetch full attachment content for parts with attachmentId
    const attachments: RawAttachment[] = [...inlineAttachments];
    const attachmentParts = collectAttachmentParts(msg.payload);

    for (const part of attachmentParts) {
      if (part.body.attachmentId) {
        try {
          const attUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${part.body.attachmentId}`;
          const attData = await this.gmailRequest<{ size: number; data: string }>(attUrl);

          attachments.push({
            filename: part.filename || 'unnamed',
            mimeType: part.mimeType || 'application/octet-stream',
            sizeBytes: attData.size,
            content: Buffer.from(base64UrlDecode(attData.data)),
          });
        } catch (error) {
          this.logger.error(
            `Failed to fetch attachment ${part.body.attachmentId}: ${(error as Error).message}`,
          );
        }
      }
    }

    return {
      messageId: internetMessageId,
      from: extractEmailAddress(from),
      to,
      cc,
      subject,
      bodyText: textBody || undefined,
      bodyHtml: htmlBody || undefined,
      receivedAt: new Date(parseInt(msg.internalDate, 10)),
      headers,
      attachments,
    };
  }

  /**
   * Mark a message as read by removing the UNREAD label.
   */
  async markAsRead(messageId: string): Promise<void> {
    if (!this.enabled) return;
    this.logger.debug(`Marking ${messageId} as read in Gmail`);

    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`;
    await this.gmailRequest(url, {
      method: 'POST',
      body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
    });
  }
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlEncodeBuffer(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('binary');
}

/**
 * Parse a comma-separated address list into an array of email addresses.
 */
function parseAddressList(header: string): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((addr) => extractEmailAddress(addr.trim()))
    .filter(Boolean);
}

/**
 * Extract just the email address from a "Name <email>" format.
 */
function extractEmailAddress(addr: string): string {
  const match = addr.match(/<([^>]+)>/);
  return match ? match[1] : addr.trim();
}

/**
 * Recursively extract text/plain, text/html body parts and inline attachments
 * from a Gmail message payload.
 */
function extractBodyParts(part: GmailMessagePart): {
  textBody: string;
  htmlBody: string;
  attachments: RawAttachment[];
} {
  let textBody = '';
  let htmlBody = '';
  const attachments: RawAttachment[] = [];

  if (part.mimeType === 'text/plain' && part.body.data && !part.filename) {
    textBody = Buffer.from(base64UrlDecode(part.body.data)).toString('utf-8');
  } else if (part.mimeType === 'text/html' && part.body.data && !part.filename) {
    htmlBody = Buffer.from(base64UrlDecode(part.body.data)).toString('utf-8');
  } else if (part.filename && part.body.data) {
    // Inline attachment with data embedded
    attachments.push({
      filename: part.filename,
      mimeType: part.mimeType,
      sizeBytes: part.body.size,
      content: Buffer.from(base64UrlDecode(part.body.data)),
    });
  }

  if (part.parts) {
    for (const subPart of part.parts) {
      const result = extractBodyParts(subPart);
      if (!textBody && result.textBody) textBody = result.textBody;
      if (!htmlBody && result.htmlBody) htmlBody = result.htmlBody;
      attachments.push(...result.attachments);
    }
  }

  return { textBody, htmlBody, attachments };
}

/**
 * Collect all parts that are attachments (have filename and attachmentId).
 */
function collectAttachmentParts(part: GmailMessagePart): GmailMessagePart[] {
  const parts: GmailMessagePart[] = [];

  if (part.filename && part.body.attachmentId) {
    parts.push(part);
  }

  if (part.parts) {
    for (const subPart of part.parts) {
      parts.push(...collectAttachmentParts(subPart));
    }
  }

  return parts;
}
