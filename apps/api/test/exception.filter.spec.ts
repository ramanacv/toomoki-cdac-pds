import { ArgumentsHost, BadRequestException, ConflictException, HttpException, HttpStatus, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { GlobalExceptionFilter } from '../src/infrastructure/exception.filter.js';

type HttpResponse = {
  status: (code: number) => HttpResponse;
  json: (body: unknown) => void;
  headersSent: boolean;
};

const makeResponse = (): HttpResponse & { statusCode: number; body: unknown } => {
  const res = { statusCode: 0, body: undefined as unknown, headersSent: false };
  const self: HttpResponse & { statusCode: number; body: unknown } = {
    ...res,
    status(code: number) {
      self.statusCode = code;
      return self;
    },
    json(body: unknown) {
      self.body = body;
    }
  };
  return self;
};

const makeHost = (response: ReturnType<typeof makeResponse>, requestId?: string): ArgumentsHost =>
  ({
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ id: requestId })
    })
  }) as unknown as ArgumentsHost;

describe('GlobalExceptionFilter (T5.2 / T6.2)', () => {
  const filter = new GlobalExceptionFilter();
  const errorSpy = vi.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);

  it('maps a plain "not found" Error to 404', () => {
    const res = makeResponse();
    filter.catch(new Error('Lot LOT-404 not found'), makeHost(res, 'req-1'));
    expect(res.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect((res.body as { error: string }).error).toBe('Not Found');
  });

  it('maps a duplicate / "already exists" Error to 409', () => {
    const res = makeResponse();
    filter.catch(new Error('Lot LOT-001 already exists'), makeHost(res));
    expect(res.statusCode).toBe(HttpStatus.CONFLICT);
  });

  it('maps a validation Error to 400', () => {
    const res = makeResponse();
    filter.catch(new Error('dispatchedQtyKg must be positive'), makeHost(res));
    expect(res.statusCode).toBe(HttpStatus.BAD_REQUEST);
  });

  it('passes HttpException status through (UnauthorizedException → 401)', () => {
    const res = makeResponse();
    filter.catch(new UnauthorizedException('no'), makeHost(res));
    expect(res.statusCode).toBe(HttpStatus.UNAUTHORIZED);
  });

  it('passes through Nest built-in 404/409/400 exceptions', () => {
    const cases: Array<[HttpException, number]> = [
      [new NotFoundException(), HttpStatus.NOT_FOUND],
      [new ConflictException(), HttpStatus.CONFLICT],
      [new BadRequestException('bad'), HttpStatus.BAD_REQUEST]
    ];
    for (const [exc, expected] of cases) {
      const res = makeResponse();
      filter.catch(exc, makeHost(res));
      expect(res.statusCode).toBe(expected);
    }
  });

  it('maps unknown errors to 500 with a requestId and logs server-side', () => {
    const res = makeResponse();
    filter.catch(new Error('something exploded internally'), makeHost(res, 'req-500'));
    expect(res.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect((res.body as { requestId?: string }).requestId).toBe('req-500');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('joins array validation messages from BadRequestException', () => {
    const res = makeResponse();
    const exc = new BadRequestException({ message: ['field1 must be a string', 'field2 must not be empty'] });
    filter.catch(exc, makeHost(res));
    expect(res.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect((res.body as { message: string }).message).toContain('field1 must be a string');
    expect((res.body as { message: string }).message).toContain('field2 must not be empty');
  });
});
