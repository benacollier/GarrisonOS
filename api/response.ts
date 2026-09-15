import { ServerResponse } from 'node:http';

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  [key: string]: unknown;
}

export interface ApiSuccessEnvelope<T = unknown> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown[];
  };
}

export function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  if (res.writableEnded) return;
  const json = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json)
  });
  res.end(json);
}

export function successResponse<T>(
  res: ServerResponse,
  data: T,
  statusCode = 200,
  meta?: PaginationMeta
): void {
  const envelope: ApiSuccessEnvelope<T> = {
    success: true,
    data,
    ...(meta ? { meta } : {})
  };
  sendJson(res, statusCode, envelope);
}

export function errorResponse(
  res: ServerResponse,
  code: string,
  message: string,
  statusCode = 400,
  details?: unknown[]
): void {
  const envelope: ApiErrorEnvelope = {
    success: false,
    error: {
      code,
      message,
      ...(details && details.length > 0 ? { details } : {})
    }
  };
  sendJson(res, statusCode, envelope);
}
