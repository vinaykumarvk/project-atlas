import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const correlationId = request.headers['x-correlation-id'] || uuidv4();
    const start = Date.now();

    request.correlationId = correlationId;

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse();
        const duration = Date.now() - start;
        this.logger.log(
          JSON.stringify({
            correlationId,
            method,
            url,
            statusCode: response.statusCode,
            duration_ms: duration,
          }),
        );
      }),
    );
  }
}
