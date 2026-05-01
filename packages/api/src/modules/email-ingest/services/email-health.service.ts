import { Injectable, Logger } from '@nestjs/common';
import { GraphMailProvider } from '../providers/graph.provider';
import { ImapProvider } from '../providers/imap.provider';

export interface ProviderHealthStatus {
  name: string;
  healthy: boolean;
  lastChecked: Date;
}

export interface EmailProvidersHealth {
  providers: ProviderHealthStatus[];
  overallHealthy: boolean;
}

/**
 * FR-155.A1: Email Provider Health Aggregation Service.
 *
 * Checks the health status of all registered email providers (Graph, IMAP)
 * and returns an aggregate health report.
 */
@Injectable()
export class EmailHealthService {
  private readonly logger = new Logger(EmailHealthService.name);

  constructor(
    private readonly graphProvider: GraphMailProvider,
    private readonly imapProvider: ImapProvider,
  ) {}

  /**
   * Check health of all registered email providers and return aggregate status.
   *
   * For Graph: attempts a lightweight poll; if it doesn't throw, the provider is healthy.
   * For IMAP: checks the connection state via isConnected().
   */
  async getProviderHealth(): Promise<EmailProvidersHealth> {
    const providers: ProviderHealthStatus[] = [];

    // Check Graph provider health
    const graphHealth = await this.checkGraphHealth();
    providers.push(graphHealth);

    // Check IMAP provider health
    const imapHealth = this.checkImapHealth();
    providers.push(imapHealth);

    const overallHealthy = providers.every((p) => p.healthy);

    return {
      providers,
      overallHealthy,
    };
  }

  /**
   * Check Microsoft Graph provider health.
   * Attempts a lightweight poll call to verify connectivity.
   */
  private async checkGraphHealth(): Promise<ProviderHealthStatus> {
    const now = new Date();
    try {
      // A poll call that returns an empty array is still a sign of health.
      // If the provider is not configured, it returns [] without error.
      await this.graphProvider.poll();
      return { name: 'graph', healthy: true, lastChecked: now };
    } catch (error) {
      this.logger.warn(`Graph provider health check failed: ${(error as Error).message}`);
      return { name: 'graph', healthy: false, lastChecked: now };
    }
  }

  /**
   * Check IMAP provider health.
   * Uses the synchronous isConnected() method.
   */
  private checkImapHealth(): ProviderHealthStatus {
    const now = new Date();
    try {
      const connected = this.imapProvider.isConnected();
      return { name: 'imap', healthy: connected, lastChecked: now };
    } catch (error) {
      this.logger.warn(`IMAP provider health check failed: ${(error as Error).message}`);
      return { name: 'imap', healthy: false, lastChecked: now };
    }
  }
}
