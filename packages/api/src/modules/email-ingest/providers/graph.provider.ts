import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailProvider, RawEmail, RawAttachment } from '../types';

/**
 * Token cache entry for OAuth2 client credentials flow.
 */
interface TokenCacheEntry {
  accessToken: string;
  expiresAt: number;
}

/**
 * Microsoft Graph API message shape (subset of fields we use).
 */
interface GraphMessage {
  id: string;
  internetMessageId?: string;
  from?: { emailAddress: { address: string; name?: string } };
  toRecipients?: Array<{ emailAddress: { address: string } }>;
  ccRecipients?: Array<{ emailAddress: { address: string } }>;
  subject?: string;
  body?: { content: string; contentType: string };
  internetMessageHeaders?: Array<{ name: string; value: string }>;
  receivedDateTime?: string;
  hasAttachments?: boolean;
  isRead?: boolean;
}

/**
 * Microsoft Graph API attachment shape.
 */
interface GraphAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  contentBytes?: string;
  isInline?: boolean;
  '@odata.type'?: string;
}

/**
 * Microsoft Graph API mail provider.
 * Uses OAuth2 client credentials flow to poll and fetch messages.
 */
@Injectable()
export class GraphMailProvider implements MailProvider {
  name = 'graph';
  private readonly logger = new Logger(GraphMailProvider.name);
  private readonly tenantId: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly mailbox: string;
  private tokenCache: TokenCacheEntry | null = null;
  private deltaLink: string | null = null;

  constructor(private config: ConfigService) {
    this.tenantId = this.config.get<string>('GRAPH_TENANT_ID', '');
    this.clientId = this.config.get<string>('GRAPH_CLIENT_ID', '');
    this.clientSecret = this.config.get<string>('GRAPH_CLIENT_SECRET', '');
    this.mailbox = this.config.get<string>(
      'GRAPH_MAILBOX_USER',
      this.config.get<string>('GRAPH_MAILBOX', 'collateral-ai@example.com'),
    );
  }

  /**
   * Acquire an OAuth2 access token using client credentials flow.
   * Caches the token until 60 seconds before expiry.
   */
  private async getAccessToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt - 60_000) {
      return this.tokenCache.accessToken;
    }

    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Graph token request failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    this.tokenCache = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };

    this.logger.debug('Acquired new Graph access token');
    return this.tokenCache.accessToken;
  }

  /**
   * Make an authenticated request to the Microsoft Graph API.
   */
  private async graphRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
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
      throw new Error(`Graph API error (${response.status}): ${errText}`);
    }

    if (response.status === 204) {
      return undefined as unknown as T;
    }

    return response.json();
  }

  /**
   * Poll the mailbox for new unread messages using delta query.
   * On first call, fetches all unread messages. Subsequent calls use delta link
   * for incremental changes.
   */
  async poll(): Promise<RawEmail[]> {
    if (!this.tenantId || !this.clientId) {
      this.logger.debug('Graph provider not configured, skipping poll');
      return [];
    }

    try {
      this.logger.log(`Polling ${this.mailbox} via Microsoft Graph API`);
      const messages = await this.pollMailbox();
      const emails: RawEmail[] = [];

      for (const msg of messages) {
        try {
          const fullMessage = await this.fetchMessage(msg.id);
          emails.push(fullMessage);
        } catch (error) {
          this.logger.error(`Failed to fetch message ${msg.id}: ${(error as Error).message}`);
        }
      }

      this.logger.log(`Polled ${emails.length} new message(s) from Graph`);
      return emails;
    } catch (error) {
      this.logger.error(`Graph poll failed: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Fetch new messages from Graph API using delta query for incremental sync.
   * Returns a list of message stubs (id + basic info).
   */
  async pollMailbox(): Promise<GraphMessage[]> {
    const messages: GraphMessage[] = [];
    let url: string;

    if (this.deltaLink) {
      url = this.deltaLink;
    } else {
      url =
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.mailbox)}` +
        `/mailFolders/inbox/messages/delta` +
        `?$filter=isRead eq false` +
        `&$top=50` +
        `&$select=id,internetMessageId,from,toRecipients,ccRecipients,subject,body,receivedDateTime,hasAttachments,isRead,internetMessageHeaders`;
    }

    // Paginate through results
    while (url) {
      const response = await this.graphRequest<{
        value: GraphMessage[];
        '@odata.nextLink'?: string;
        '@odata.deltaLink'?: string;
      }>(url);

      if (response.value) {
        // Only include unread messages
        for (const msg of response.value) {
          if (msg.isRead === false || !this.deltaLink) {
            messages.push(msg);
          }
        }
      }

      // Save delta link for next incremental poll
      if (response['@odata.deltaLink']) {
        this.deltaLink = response['@odata.deltaLink'];
        url = '';
      } else if (response['@odata.nextLink']) {
        url = response['@odata.nextLink'];
      } else {
        url = '';
      }
    }

    return messages;
  }

  /**
   * Fetch a full email message with attachments from Graph API.
   * Maps the Graph response to our RawEmail type.
   */
  async fetchMessage(messageId: string): Promise<RawEmail> {
    const baseUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.mailbox)}/messages/${messageId}`;

    // Fetch the full message with headers
    const msg = await this.graphRequest<GraphMessage>(
      `${baseUrl}?$select=id,internetMessageId,from,toRecipients,ccRecipients,subject,body,receivedDateTime,hasAttachments,internetMessageHeaders`,
    );

    // Extract headers into a flat record
    const headers: Record<string, string> = {};
    if (msg.internetMessageHeaders) {
      for (const header of msg.internetMessageHeaders) {
        headers[header.name.toLowerCase()] = header.value;
      }
    }

    // Extract Message-ID from headers or from Graph's internetMessageId field
    const extractedMessageId =
      msg.internetMessageId ||
      headers['message-id'] ||
      `<graph-${messageId}@graph.microsoft.com>`;

    // Fetch attachments if present
    const attachments: RawAttachment[] = [];
    if (msg.hasAttachments) {
      const attResponse = await this.graphRequest<{ value: GraphAttachment[] }>(
        `${baseUrl}/attachments?$select=id,name,contentType,size,contentBytes,isInline`,
      );

      if (attResponse.value) {
        for (const att of attResponse.value) {
          // Only process file attachments (skip item attachments, reference attachments)
          if (att['@odata.type'] === '#microsoft.graph.itemAttachment') {
            continue;
          }
          if (att.contentBytes) {
            attachments.push({
              filename: att.name || 'unnamed',
              mimeType: att.contentType || 'application/octet-stream',
              sizeBytes: att.size,
              content: Buffer.from(att.contentBytes, 'base64'),
            });
          }
        }
      }
    }

    // Map body content
    const bodyContent = msg.body?.content || '';
    const isHtml = msg.body?.contentType?.toLowerCase() === 'html';

    return {
      messageId: extractedMessageId,
      from: msg.from?.emailAddress?.address || '',
      to: (msg.toRecipients || []).map((r) => r.emailAddress.address),
      cc: (msg.ccRecipients || []).map((r) => r.emailAddress.address),
      subject: msg.subject || '',
      bodyText: isHtml ? stripHtml(bodyContent) : bodyContent,
      bodyHtml: isHtml ? bodyContent : undefined,
      receivedAt: msg.receivedDateTime ? new Date(msg.receivedDateTime) : new Date(),
      headers,
      attachments,
    };
  }

  /**
   * Mark a message as read in the mailbox.
   */
  async markAsRead(messageId: string): Promise<void> {
    if (!this.tenantId || !this.clientId) return;

    this.logger.debug(`Marking ${messageId} as read in Graph`);
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.mailbox)}/messages/${messageId}`;
    await this.graphRequest(url, {
      method: 'PATCH',
      body: JSON.stringify({ isRead: true }),
    });
  }
}

/**
 * Simple HTML tag stripper for extracting plain text from HTML body.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
