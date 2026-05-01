import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class ConsentRenewalService {
  private readonly logger = new Logger(ConsentRenewalService.name);
  private consents: Array<{
    id: string;
    customerId: string;
    type: string;
    expiresAt: Date;
    renewalSent: boolean;
  }> = [];

  constructor(@Optional() private readonly notificationService?: { send(payload: { template: string; channel: string; recipients: string[]; context: Record<string, string> }): Promise<void> }) {}

  registerConsent(consent: { id: string; customerId: string; type: string; expiresAt: Date }): void {
    this.consents.push({ ...consent, renewalSent: false });
  }

  @Cron(CronExpression.EVERY_WEEK)
  async handleConsentRenewalReminders(): Promise<void> {
    this.logger.log('Consent renewal reminder check triggered');
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const expiring = this.consents.filter(
      (c) => !c.renewalSent && c.expiresAt <= thirtyDaysFromNow && c.expiresAt > now,
    );

    for (const consent of expiring) {
      if (this.notificationService) {
        await this.notificationService.send({
          template: 'CONSENT_RENEWAL_REMINDER',
          channel: 'EMAIL',
          recipients: [consent.customerId],
          context: {
            consentId: consent.id,
            consentType: consent.type,
            expiresAt: consent.expiresAt.toISOString(),
          },
        });
      }
      consent.renewalSent = true;
      this.logger.log(`Renewal reminder sent for consent=${consent.id} customer=${consent.customerId}`);
    }

    if (expiring.length > 0) {
      this.logger.log(`Sent ${expiring.length} consent renewal reminders`);
    }
  }

  getExpiringConsents(withinDays: number = 30): Array<{ id: string; customerId: string; type: string; expiresAt: Date; renewalSent: boolean }> {
    const now = new Date();
    const cutoff = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);
    return this.consents.filter((c) => c.expiresAt <= cutoff && c.expiresAt > now);
  }
}
