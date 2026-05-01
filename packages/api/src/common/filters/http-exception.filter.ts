import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ErrorCode } from '@atlas/shared';
import { PiiRedactionService } from '../../modules/audit/services/pii-redaction.service';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly piiRedactionService = new PiiRedactionService();

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = ErrorCode.INTERNAL_ERROR;
    let message = 'An unexpected error occurred';
    let field: string | undefined;
    let details: unknown[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string) || exception.message;
        if (Array.isArray(resp.message)) {
          details = resp.message;
          message = 'Validation failed';
        }
      } else {
        message = exception.message;
      }

      switch (status) {
        case HttpStatus.UNAUTHORIZED:
          code = ErrorCode.AUTH_REQUIRED;
          break;
        case HttpStatus.FORBIDDEN:
          code = ErrorCode.AUTH_FORBIDDEN;
          break;
        case HttpStatus.NOT_FOUND:
          code = ErrorCode.RESOURCE_NOT_FOUND;
          break;
        case HttpStatus.CONFLICT:
          code = ErrorCode.CONFLICT;
          break;
        case HttpStatus.TOO_MANY_REQUESTS:
          code = ErrorCode.RATE_LIMITED;
          break;
        case HttpStatus.BAD_REQUEST:
          code = ErrorCode.VALIDATION_ERROR;
          break;
        default:
          code = ErrorCode.INTERNAL_ERROR;
      }
    }

    // Redact PII from error message and details before sending to client
    const redactedMessage = this.piiRedactionService.redact(message);
    const redactedDetails = details
      ? this.piiRedactionService.redact(details)
      : undefined;

    response.status(status).json({
      error: {
        code,
        message: redactedMessage,
        ...(field && { field }),
        trace_id: uuidv4(),
        ...(redactedDetails && { details: redactedDetails }),
      },
    });
  }
}
