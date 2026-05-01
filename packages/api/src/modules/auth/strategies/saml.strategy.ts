import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SamlConfig {
  entryPoint: string;
  issuer: string;
  cert: string;
  callbackUrl: string;
}

export interface SamlProfile {
  nameID: string;
  email: string;
  firstName?: string;
  lastName?: string;
  groups?: string[];
}

@Injectable()
export class SamlStrategy {
  private readonly logger = new Logger(SamlStrategy.name);
  private config: SamlConfig | null = null;

  constructor(private readonly configService: ConfigService) {
    const entryPoint = this.configService.get<string>('SAML_ENTRY_POINT');
    if (entryPoint) {
      this.config = {
        entryPoint,
        issuer: this.configService.get<string>('SAML_ISSUER') || 'atlas-app',
        cert: this.configService.get<string>('SAML_CERT') || '',
        callbackUrl: this.configService.get<string>('SAML_CALLBACK_URL') || '/auth/saml/callback',
      };
      this.logger.log('SAML strategy configured');
    }
  }

  isConfigured(): boolean {
    return this.config !== null;
  }

  getConfig(): SamlConfig | null {
    return this.config;
  }

  validateAssertion(samlResponse: string): SamlProfile | null {
    if (!this.config) return null;
    // In production, this would validate the XML signature using the IdP cert
    // For now, parse a base64-encoded JSON mock
    try {
      const decoded = Buffer.from(samlResponse, 'base64').toString('utf-8');
      const profile = JSON.parse(decoded) as SamlProfile;
      if (!profile.nameID || !profile.email) return null;
      this.logger.log(`SAML assertion validated for ${profile.email}`);
      return profile;
    } catch {
      this.logger.warn('Failed to validate SAML assertion');
      return null;
    }
  }

  generateLoginUrl(relayState?: string): string {
    if (!this.config) throw new Error('SAML not configured');
    const params = new URLSearchParams({
      SAMLRequest: Buffer.from(JSON.stringify({ issuer: this.config.issuer })).toString('base64'),
    });
    if (relayState) params.set('RelayState', relayState);
    return `${this.config.entryPoint}?${params.toString()}`;
  }
}
