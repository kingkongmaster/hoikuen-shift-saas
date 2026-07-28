import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { RequestWithContext } from './request-context.middleware';
import { redactSecrets } from '../logging/production-json.logger';

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithContext>();
    const response = context.getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const known = error instanceof HttpException ? error.getResponse() : undefined;
    const body = status >= 500 ? { statusCode: status, message: '内部エラーが発生しました。', requestId: request.requestId } :
      typeof known === 'string' ? { statusCode: status, message: known, requestId: request.requestId } : { ...(known as object), requestId: request.requestId };
    if (status >= 500) {
      const log = { timestamp: new Date().toISOString(), level: 'error', type: 'unhandled_error', requestId: request.requestId, method: request.method, path: request.path, status };
      if (process.env.NODE_ENV === 'production') {
        process.stderr.write(`${JSON.stringify(log)}\n`);
      } else {
        const diagnostic = error instanceof Error ? redactSecrets(error.stack ?? error.message) : 'Unknown error';
        process.stderr.write(`[error] ${JSON.stringify(log)}\n${diagnostic}\n`);
      }
    }
    response.status(status).json(body);
  }
}
