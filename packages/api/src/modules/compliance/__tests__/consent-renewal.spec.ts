import { ConsentRenewalService } from '../services/consent-renewal.service';

describe('ConsentRenewalService', () => {
  let service: ConsentRenewalService;
  let mockNotification: any;

  beforeEach(() => {
    mockNotification = { send: jest.fn().mockResolvedValue(undefined) };
    service = new ConsentRenewalService(mockNotification);
  });

  it('should send reminders for consents expiring within 30 days', async () => {
    const expiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days from now
    service.registerConsent({ id: 'c1', customerId: 'cust1', type: 'MARKETING', expiresAt });
    await service.handleConsentRenewalReminders();
    expect(mockNotification.send).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'CONSENT_RENEWAL_REMINDER' }),
    );
  });

  it('should not send reminders for consents expiring beyond 30 days', async () => {
    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days
    service.registerConsent({ id: 'c2', customerId: 'cust2', type: 'MARKETING', expiresAt });
    await service.handleConsentRenewalReminders();
    expect(mockNotification.send).not.toHaveBeenCalled();
  });

  it('should not send duplicate reminders', async () => {
    const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    service.registerConsent({ id: 'c3', customerId: 'cust3', type: 'DATA', expiresAt });
    await service.handleConsentRenewalReminders();
    await service.handleConsentRenewalReminders();
    expect(mockNotification.send).toHaveBeenCalledTimes(1);
  });

  it('should return expiring consents within specified days', () => {
    const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const later = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
    service.registerConsent({ id: 'c4', customerId: 'cust4', type: 'MARKETING', expiresAt: soon });
    service.registerConsent({ id: 'c5', customerId: 'cust5', type: 'DATA', expiresAt: later });
    const expiring = service.getExpiringConsents(30);
    expect(expiring.length).toBe(1);
    expect(expiring[0].id).toBe('c4');
  });
});
