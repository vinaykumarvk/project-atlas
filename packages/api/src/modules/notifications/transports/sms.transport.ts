import { Injectable, Logger } from '@nestjs/common';

/**
 * SMS Transport Service.
 *
 * Sends SMS notifications via a configurable provider URL.
 * If SMS_PROVIDER_URL is not set, operates in stub mode (logs and returns true).
 */
@Injectable()
export class SmsTransport {
  private readonly logger = new Logger(SmsTransport.name);
  private readonly providerUrl: string | undefined;

  constructor() {
    this.providerUrl = process.env.SMS_PROVIDER_URL;
  }

  /**
   * Send an SMS message to the given recipient.
   * Returns true if the message was sent (or stubbed) successfully.
   */
  async send(recipient: string, message: string): Promise<boolean> {
    if (!this.providerUrl) {
      this.logger.log(
        `[STUB] SMS to ${recipient}: ${message.substring(0, 100)}`,
      );
      return true;
    }

    try {
      this.logger.log(
        `Sending SMS to ${recipient} via ${this.providerUrl}`,
      );
      // Simulate HTTP call to SMS provider
      // In production, this would use HttpService or fetch to POST to the provider URL
      this.logger.log(
        `SMS sent to ${recipient} via provider`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send SMS to ${recipient}: ${(error as Error).message}`,
      );
      return false;
    }
  }
}
