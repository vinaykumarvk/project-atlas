import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

@Injectable()
export class PagerDutyService {
  private readonly logger = new Logger(PagerDutyService.name);
  private readonly apiKey: string | null;
  private readonly serviceId: string | null;
  private readonly incidents: Array<{
    id: string;
    title: string;
    severity: string;
    createdAt: Date;
    status: string;
  }> = [];

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('PAGERDUTY_API_KEY') || null;
    this.serviceId =
      this.configService.get<string>('PAGERDUTY_SERVICE_ID') || null;
  }

  isConfigured(): boolean {
    return this.apiKey !== null && this.serviceId !== null;
  }

  async createIncident(
    title: string,
    severity: 'critical' | 'error' | 'warning' | 'info',
    details?: Record<string, unknown>,
  ): Promise<{ incidentId: string; status: string }> {
    if (!this.isConfigured()) {
      this.logger.warn(
        'PagerDuty not configured, creating mock incident for: ' + title,
      );
    }

    const incidentId = randomUUID();
    const incident = {
      id: incidentId,
      title,
      severity,
      createdAt: new Date(),
      status: 'triggered',
    };
    this.incidents.push(incident);

    this.logger.log(
      `Incident created: ${incidentId} [${severity}] ${title}` +
        (details ? ` details=${JSON.stringify(details)}` : ''),
    );

    return { incidentId, status: 'triggered' };
  }

  async resolveIncident(incidentId: string): Promise<boolean> {
    const incident = this.incidents.find((i) => i.id === incidentId);
    if (!incident) {
      this.logger.warn(`Incident not found: ${incidentId}`);
      return false;
    }

    incident.status = 'resolved';
    this.logger.log(`Incident resolved: ${incidentId}`);
    return true;
  }

  getIncidents(): Array<{
    id: string;
    title: string;
    severity: string;
    createdAt: Date;
  }> {
    return this.incidents.map(({ id, title, severity, createdAt }) => ({
      id,
      title,
      severity,
      createdAt,
    }));
  }
}
