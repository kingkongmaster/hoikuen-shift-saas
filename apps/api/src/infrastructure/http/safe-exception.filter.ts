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
    const parserErrors: Record<string, { status: number; message: string }> = {
      'entity.parse.failed': { status: 400, message: 'JSON形式が不正です。' },
      'entity.too.large': { status: 413, message: '入力サイズが上限を超えています。' },
      'encoding.unsupported': { status: 415, message: '圧縮された入力には対応していません。' },
      'charset.unsupported': { status: 415, message: '文字コードに対応していません。' },
      'request.aborted': { status: 400, message: '入力の受信が中断されました。' },
    };
    const parserError = error && typeof error === 'object' && 'type' in error ? parserErrors[String(error.type)] : undefined;
    const status = error instanceof HttpException ? error.getStatus() : parserError?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const known = error instanceof HttpException ? error.getResponse() : undefined;
    const body = status >= 500 ? { statusCode: status, message: '内部エラーが発生しました。', requestId: request.requestId } :
      parserError ? { statusCode: status, message: parserError.message, requestId: request.requestId } :
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
