import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class PromptRedactionService {
  private readonly logger = new Logger(PromptRedactionService.name);

  private readonly piiPatterns: { name: string; pattern: RegExp; replacement: string }[] = [
    { name: 'AADHAAR', pattern: /\b\d{4}\s?\d{4}\s?\d{4}\b/g, replacement: '[AADHAAR_REDACTED]' },
    { name: 'PAN', pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/g, replacement: '[PAN_REDACTED]' },
    { name: 'EMAIL', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL_REDACTED]' },
    { name: 'PHONE', pattern: /\b(?:\+91[\s-]?)?[6-9]\d{9}\b/g, replacement: '[PHONE_REDACTED]' },
    { name: 'ACCOUNT', pattern: /\b\d{9,18}\b/g, replacement: '[ACCOUNT_REDACTED]' },
  ];

  redactPrompt(prompt: string): string {
    let redacted = prompt;
    for (const { pattern, replacement } of this.piiPatterns) {
      redacted = redacted.replace(new RegExp(pattern.source, pattern.flags), replacement);
    }
    return redacted;
  }

  redactReport(report: Record<string, any>, options: { redacted: boolean }): Record<string, any> {
    if (!options.redacted) return report;

    const redacted = JSON.parse(JSON.stringify(report));
    const redactObject = (obj: any): void => {
      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'string') {
          obj[key] = this.redactPrompt(obj[key]);
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          redactObject(obj[key]);
        }
      }
    };
    redactObject(redacted);
    return redacted;
  }
}
