import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Abstraction for a mail provider that can connect, listen, and fetch emails.
 */
export interface MailProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onNewMail(callback: (email: RawEmailData) => void): void;
  fetchUnread(limit?: number): Promise<RawEmailData[]>;
}

/**
 * Raw email data structure from the mail provider.
 */
export interface RawEmailData {
  messageId: string;
  from: string;
  to: string[];
  subject: string;
  body: string;
  receivedAt: Date;
  headers: Record<string, string>;
}

/**
 * IMAP IDLE Provider (FR-144.A2).
 *
 * Implements the MailProvider interface using IMAP IDLE for real-time
 * email notifications. In this implementation, the actual IMAP connection
 * is mocked — the service validates configuration, manages connection
 * state, and supports simulated incoming emails for testing.
 */
@Injectable()
export class ImapProvider implements MailProvider {
  private readonly logger = new Logger(ImapProvider.name);
  private connected = false;
  private listeners: Array<(email: RawEmailData) => void> = [];

  /** In-memory unread email store for mock implementation. */
  private readonly unreadEmails: RawEmailData[] = [];

  private readonly host: string;
  private readonly port: number;
  private readonly user: string;
  private readonly password: string;
  private readonly tls: boolean;

  constructor(private readonly configService: ConfigService) {
    this.host = this.configService.get<string>('IMAP_HOST', 'localhost');
    this.port = parseInt(
      this.configService.get<string>('IMAP_PORT', '993'),
      10,
    );
    this.user = this.configService.get<string>('IMAP_USER', '');
    this.password = this.configService.get<string>('IMAP_PASSWORD', '');
    this.tls = this.configService.get<string>('IMAP_TLS', 'true') === 'true';

    this.logger.log(`IMAP provider configured for ${this.host}:${this.port}`);
  }

  /**
   * Connect to the IMAP server and start IDLE mode.
   */
  async connect(): Promise<void> {
    if (this.connected) {
      this.logger.warn('IMAP provider already connected');
      return;
    }

    this.logger.log(`Connecting to IMAP server ${this.host}:${this.port}`);
    // Mock: simulate successful connection
    this.connected = true;
    this.logger.log('IMAP connection established, IDLE mode active');
  }

  /**
   * Disconnect from the IMAP server.
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      this.logger.warn('IMAP provider not connected');
      return;
    }

    this.logger.log('Disconnecting from IMAP server');
    this.connected = false;
    this.listeners = [];
    this.logger.log('IMAP connection closed');
  }

  /**
   * Register a callback for new mail events (IMAP IDLE notifications).
   */
  onNewMail(callback: (email: RawEmailData) => void): void {
    this.listeners.push(callback);
    this.logger.log('New mail listener registered');
  }

  /**
   * Fetch unread emails from the mailbox.
   *
   * @param limit - Maximum number of emails to fetch (default: 50)
   */
  async fetchUnread(limit = 50): Promise<RawEmailData[]> {
    if (!this.connected) {
      this.logger.warn('Cannot fetch: IMAP provider not connected');
      return [];
    }

    this.logger.log(`Fetching up to ${limit} unread emails`);
    const emails = this.unreadEmails.splice(0, limit);
    this.logger.log(`Fetched ${emails.length} unread email(s)`);
    return emails;
  }

  /**
   * Simulate an incoming email for testing.
   * Adds the email to the unread queue and notifies all listeners.
   */
  simulateIncoming(email: RawEmailData): void {
    this.unreadEmails.push(email);
    for (const listener of this.listeners) {
      listener(email);
    }
  }

  /**
   * Check whether the provider is currently connected.
   */
  isConnected(): boolean {
    return this.connected;
  }
}
