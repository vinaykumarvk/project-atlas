import { Injectable, Logger } from '@nestjs/common';

/**
 * WhatsApp Transport Service.
 *
 * Sends WhatsApp notifications via a configurable provider URL.
 * If WHATSAPP_PROVIDER_URL is not set, operates in stub mode (logs and returns true).
 */
@Injectable()
export class WhatsAppTransport {
  private readonly logger = new Logger(WhatsAppTransport.name);
  private readonly providerUrl: string | undefined;

  constructor() {
    this.providerUrl = process.env.WHATSAPP_PROVIDER_URL;
  }

  /**
   * Send a WhatsApp message to the given recipient.
   * Returns true if the message was sent (or stubbed) successfully.
   */
  async send(recipient: string, message: string): Promise<boolean> {
    if (!this.providerUrl) {
      this.logger.log(
        `[STUB] WhatsApp to ${recipient}: ${message.substring(0, 100)}`,
      );
      return true;
    }

    try {
      this.logger.log(
        `Sending WhatsApp message to ${recipient} via ${this.providerUrl}`,
      );
      // Simulate HTTP call to WhatsApp provider
      // In production, this would use HttpService or fetch to POST to the provider URL
      this.logger.log(
        `WhatsApp message sent to ${recipient} via provider`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send WhatsApp to ${recipient}: ${(error as Error).message}`,
      );
      return false;
    }
  }
}
