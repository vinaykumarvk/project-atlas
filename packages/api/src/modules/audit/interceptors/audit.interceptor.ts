import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AuditLogService } from '../services/audit-log.service';
import { PiiRedactionService } from '../services/pii-redaction.service';
import { AUDITED_KEY, AuditedOptions } from '../decorators/audited.decorator';

/**
 * Maps HTTP methods to audit action verbs.
 */
const METHOD_ACTION_MAP: Record<string, string> = {
  GET: 'READ',
  POST: 'CREATE',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogService: AuditLogService,
    private readonly piiRedactionService: PiiRedactionService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Check if handler or class is decorated with @Audited()
    const auditOptions = this.reflector.getAllAndOverride<
      AuditedOptions | undefined
    >(AUDITED_KEY, [context.getHandler(), context.getClass()]);

    // Not audited — pass through
    if (auditOptions === undefined) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const startTime = Date.now();
    const httpMethod: string = request.method;
    const path: string = request.route?.path ?? request.url;
    const params: Record<string, string> = request.params ?? {};

    // Derive action from HTTP method
    const action = METHOD_ACTION_MAP[httpMethod.toUpperCase()] ?? 'UNKNOWN';

    // Derive resource_type: prefer decorator override, then first route param name
    const resourceType =
      auditOptions.resourceType ?? this.extractResourceType(path);

    // Derive resource_id from route params (first param value, typically `:id`)
    const resourceId = this.extractResourceId(params);

    // Derive event_code
    const eventCode =
      auditOptions.eventCode ?? `${resourceType}.${action}`.toUpperCase();

    // Extract actor from request.user (set by JwtAuthGuard)
    const user = request.user as
      | { id: string; email?: string; roles?: string[] }
      | undefined;

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - startTime;

          // Build the payload and redact PII before persisting
          const rawPayload = {
            method: httpMethod,
            path,
            duration_ms: durationMs,
            status: 'SUCCESS',
          };
          const redactedPayload = this.piiRedactionService.redact(rawPayload);

          this.auditLogService
            .emit({
              event_code: eventCode,
              actor_id: user?.id,
              actor_type: user ? 'USER' : 'SYSTEM',
              resource_type: resourceType,
              resource_id: resourceId ?? undefined,
              action,
              ip_address:
                request.ip ?? request.connection?.remoteAddress ?? null,
              user_agent: request.headers?.['user-agent'] ?? null,
              payload_json: redactedPayload,
            })
            .catch((err) =>
              this.logger.error('Failed to emit audit event', err),
            );
        },
        error: (err: Error) => {
          const durationMs = Date.now() - startTime;

          // Redact PII from error messages before persisting
          const rawPayload = {
            method: httpMethod,
            path,
            duration_ms: durationMs,
            status: 'ERROR',
            error_message: err.message,
          };
          const redactedPayload = this.piiRedactionService.redact(rawPayload);

          this.auditLogService
            .emit({
              event_code: eventCode,
              actor_id: user?.id,
              actor_type: user ? 'USER' : 'SYSTEM',
              resource_type: resourceType,
              resource_id: resourceId ?? undefined,
              action,
              ip_address:
                request.ip ?? request.connection?.remoteAddress ?? null,
              user_agent: request.headers?.['user-agent'] ?? null,
              payload_json: redactedPayload,
            })
            .catch((auditErr) =>
              this.logger.error('Failed to emit audit event', auditErr),
            );
        },
      }),
    );
  }

  // ─────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────

  /**
   * Extract a resource type name from the route path.
   * e.g.  /v1/cases/:id  →  "CASE"
   *       /v1/compliance/dsr  →  "DSR"
   */
  private extractResourceType(path: string): string {
    const segments = path
      .split('/')
      .filter((s) => s && !s.startsWith(':') && s !== 'v1');
    const last = segments[segments.length - 1] ?? 'RESOURCE';
    // Singularise naively: drop trailing 's' if present
    const singular = last.endsWith('s') ? last.slice(0, -1) : last;
    return singular.toUpperCase();
  }

  /**
   * Return the first route param value that looks like an id.
   */
  private extractResourceId(
    params: Record<string, string>,
  ): string | null {
    // Prefer 'id', then 'subjectId', then any first param value
    if (params['id']) return params['id'];
    const values = Object.values(params);
    return values.length > 0 ? values[0] : null;
  }
}
