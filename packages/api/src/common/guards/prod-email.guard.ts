import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';

/**
 * Guard that prevents sending real emails in non-production environments
 * (FR-129.A1).
 *
 * Behaviour:
 *   - NODE_ENV === 'production': allows the request through for real email delivery.
 *   - Any other NODE_ENV: logs the email payload to a sink (Logger) and blocks
 *     the real send by returning false, preventing accidental email dispatch
 *     during development or staging.
 *
 * Apply this guard on email-sending endpoints:
 *   @UseGuards(ProdEmailGuard)
 */
@Injectable()
export class ProdEmailGuard implements CanActivate {
  private readonly logger = new Logger(ProdEmailGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
      return true;
    }

    // Non-production: redirect to sink/log instead of sending real emails
    const request = context.switchToHttp().getRequest();
    const body = request.body ?? {};

    this.logger.warn(
      `[EMAIL SINK] Real email send blocked in ${process.env.NODE_ENV ?? 'unknown'} environment. ` +
        `Payload redirected to log sink: ${JSON.stringify({
          to: body.to ?? body.recipient ?? body.recipients,
          subject: body.subject,
          from: body.from ?? body.sender,
          template: body.template ?? body.templateId,
        })}`,
    );

    // Attach a flag so downstream handlers can detect the sink redirect
    request.emailSinkRedirected = true;

    // Return false to prevent the request from reaching the real email handler.
    // Controllers can also check request.emailSinkRedirected if they need
    // to return a mock response instead.
    return false;
  }
}
