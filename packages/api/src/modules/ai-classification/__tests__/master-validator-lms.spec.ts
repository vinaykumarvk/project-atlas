import { MasterValidator, LmsLookupProvider } from '../validation/master-validator';

describe('MasterValidator — LMS cross-check', () => {
  let validator: MasterValidator;

  beforeEach(() => {
    validator = new MasterValidator();
  });

  describe('crossCheckWithLms()', () => {
    it('should return NO_LMS_PROVIDER when no provider is configured', async () => {
      const result = await validator.crossCheckWithLms('LN-1234-5678');
      expect(result.valid).toBe(false);
      expect(result.source).toBe('NO_LMS_PROVIDER');
    });

    it('should return LMS_VERIFIED when account is found in LMS', async () => {
      const mockProvider: LmsLookupProvider = {
        lookupAccount: jest.fn().mockResolvedValue({
          valid: true,
          details: { accountName: 'Test Account' },
        }),
      };

      validator.setLmsProvider(mockProvider);

      const result = await validator.crossCheckWithLms('LN-1234-5678');
      expect(result.valid).toBe(true);
      expect(result.source).toBe('LMS_VERIFIED');
      expect(mockProvider.lookupAccount).toHaveBeenCalledWith('LN-1234-5678');
    });

    it('should return LMS_NOT_FOUND when account is not in LMS', async () => {
      const mockProvider: LmsLookupProvider = {
        lookupAccount: jest.fn().mockResolvedValue({
          valid: false,
        }),
      };

      validator.setLmsProvider(mockProvider);

      const result = await validator.crossCheckWithLms('INVALID-ACCT');
      expect(result.valid).toBe(false);
      expect(result.source).toBe('LMS_NOT_FOUND');
    });

    it('should return LMS_ERROR when LMS lookup throws an error', async () => {
      const mockProvider: LmsLookupProvider = {
        lookupAccount: jest.fn().mockRejectedValue(new Error('Connection timeout')),
      };

      validator.setLmsProvider(mockProvider);

      const result = await validator.crossCheckWithLms('LN-1234-5678');
      expect(result.valid).toBe(false);
      expect(result.source).toBe('LMS_ERROR');
    });

    it('should allow setting LMS provider via constructor', async () => {
      const mockProvider: LmsLookupProvider = {
        lookupAccount: jest.fn().mockResolvedValue({ valid: true }),
      };

      const validatorWithLms = new MasterValidator(mockProvider);

      const result = await validatorWithLms.crossCheckWithLms('LN-9999');
      expect(result.valid).toBe(true);
      expect(result.source).toBe('LMS_VERIFIED');
    });

    it('should allow setting LMS provider via setLmsProvider()', async () => {
      const mockProvider: LmsLookupProvider = {
        lookupAccount: jest.fn().mockResolvedValue({ valid: true }),
      };

      validator.setLmsProvider(mockProvider);

      const result = await validator.crossCheckWithLms('LN-9999');
      expect(result.valid).toBe(true);
    });
  });

  describe('existing validate() functionality', () => {
    it('should still validate city entities correctly', async () => {
      const outcomes = await validator.validate([
        { entity_type: 'property_city', value: 'Mumbai', start_offset: 0, end_offset: 6, confidence: 0.9 },
      ]);

      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].outcome).toBe('PASS');
      expect(outcomes[0].resolved_value).toBe('Mumbai');
    });

    it('should still validate loan account format', async () => {
      const outcomes = await validator.validate([
        { entity_type: 'loan_account_no', value: 'LN-2024-12345678', start_offset: 0, end_offset: 17, confidence: 0.9 },
      ]);

      expect(outcomes).toHaveLength(1);
      // Without an LMS provider, format-valid accounts still PASS (LMS check returns NO_LMS_PROVIDER but does not flip to FAIL)
      expect(outcomes[0].outcome).toBe('PASS');
    });

    it('should still detect fuzzy matches', async () => {
      const outcomes = await validator.validate([
        { entity_type: 'property_city', value: 'Mumba', start_offset: 0, end_offset: 5, confidence: 0.8 },
      ]);

      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].outcome).toBe('FUZZY_MATCH');
      expect(outcomes[0].resolved_value).toBe('Mumbai');
    });
  });
});
