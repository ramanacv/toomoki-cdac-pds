import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

/**
 * Global exception filter (T5.2). Maps domain errors to the correct HTTP
 * status so callers get 4xx instead of a blanket 500:
 *
 *  - HttpException: pass through with its own status (UnauthorizedException 401,
 *    BadRequestException 400, etc.).
 *  - "not found" in the message      → 404
 *  - "already exists" / "already received" / "already in transit" / "duplicate"
 *                                    → 409
 *  - validation phrases ("must be", "exceeds", "invalid", "insufficient",
 *    "cannot proceed", "prohibited", "not authorized", "whitespace")
 *                                    → 400
 *  - everything else                 → 500 (with a generated requestId)
 *
 * The 500 response includes a requestId; the full stack is logged server-side
 * but never returned to the client.
 */
const NOT_FOUND_RE = /not found/i;
const CONFLICT_RE = /already exists|already received|already in transit|duplicate/i;
const VALIDATION_RE =
  /must be|must not|exceeds|invalid|insufficient|cannot proceed|prohibited|not authorized|whitespace|looks like a raw numeric/i;

type ErrorBody = {
  statusCode: number;
  error: string;
  message: string;
  requestId?: string;
};

type HttpResponse = {
  status(code: number): HttpResponse;
  json(body: unknown): void;
  headersSent: boolean;
};

type HttpRequest = {
  id?: string;
};

const TITLES: Partial<Record<number, string>> = {
  [HttpStatus.NOT_FOUND]: 'Not Found',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.BAD_REQUEST]: 'Bad Request',
  [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
  [HttpStatus.FORBIDDEN]: 'Forbidden',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error'
};

const statusFor = (message: string): HttpStatus => {
  if (NOT_FOUND_RE.test(message)) return HttpStatus.NOT_FOUND;
  if (CONFLICT_RE.test(message)) return HttpStatus.CONFLICT;
  if (VALIDATION_RE.test(message)) return HttpStatus.BAD_REQUEST;
  return HttpStatus.INTERNAL_SERVER_ERROR;
};

const titleFor = (status: HttpStatus): string => TITLES[status] ?? 'Error';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<HttpResponse>();
    const request = ctx.getRequest<HttpRequest>();
    const requestId = request.id ?? randomUUID();

    let status: HttpStatus;
    let message: string;
    let body: ErrorBody;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message =
        typeof res === 'string'
          ? res
          : (res as { message?: unknown }).message
            ? Array.isArray((res as { message: unknown[] }).message)
              ? ((res as { message: string[] }).message).join(', ')
              : String((res as { message: string }).message)
            : exception.message;
      body = { statusCode: status, error: titleFor(status), message, requestId };
    } else if (exception instanceof Error) {
      status = statusFor(exception.message);
      message = exception.message;
      body = { statusCode: status, error: titleFor(status), message };
      if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
        body.requestId = requestId;
        this.logger.error(`[${requestId}] ${exception.message}`, exception.stack);
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Unexpected error';
      body = { statusCode: status, error: titleFor(status), message, requestId };
      this.logger.error(`[${requestId}] Non-error exception thrown`, String(exception));
    }

    if (!response.headersSent) {
      response.status(status).json(body);
    }
  }
}
