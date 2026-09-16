import { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { errorResponse } from './response.js';

export interface ApiRequest extends IncomingMessage {
  params: Record<string, string>;
  query: Record<string, string>;
  body: any;
  path: string;
  tenantId?: string;
  userId?: string;
  correlationId?: string;
}

export type Handler = (req: ApiRequest, res: ServerResponse) => Promise<void> | void;
export type Middleware = (req: ApiRequest, res: ServerResponse, next: () => Promise<void>) => Promise<void> | void;

interface RouteEntry {
  method: string;
  pattern: string;
  paramNames: string[];
  regex: RegExp;
  handlers: Handler[];
  batchSafe: boolean;
}

const MAX_BODY_SIZE_BYTES = 1024 * 1024; // 1 MB

export class Router {
  private routes: RouteEntry[] = [];
  private middlewares: Middleware[] = [];

  public use(middleware: Middleware): void {
    this.middlewares.push(middleware);
  }

  private register(method: string, pattern: string, handlers: Handler[], batchSafe = true): void {
    const paramNames: string[] = [];
    const normalizedPattern = pattern.startsWith('/') ? pattern : `/${pattern}`;
    
    // Replace :param with regex capture group and extract param names
    const regexPattern = normalizedPattern
      .replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/]+)';
      })
      .replace(/\/$/, ''); // Remove trailing slash for uniformity

    const regex = new RegExp(`^${regexPattern || '/'}/?$`);

    this.routes.push({
      method: method.toUpperCase(),
      pattern: normalizedPattern,
      paramNames,
      regex,
      handlers,
      batchSafe
    });
  }

  public get(pattern: string, ...handlers: Handler[]): void {
    this.register('GET', pattern, handlers);
  }

  public getUnsafe(pattern: string, ...handlers: Handler[]): void {
    this.register('GET', pattern, handlers, false);
  }

  public post(pattern: string, ...handlers: Handler[]): void {
    this.register('POST', pattern, handlers);
  }

  public put(pattern: string, ...handlers: Handler[]): void {
    this.register('PUT', pattern, handlers);
  }

  public patch(pattern: string, ...handlers: Handler[]): void {
    this.register('PATCH', pattern, handlers);
  }

  public delete(pattern: string, ...handlers: Handler[]): void {
    this.register('DELETE', pattern, handlers);
  }

  public options(pattern: string, ...handlers: Handler[]): void {
    this.register('OPTIONS', pattern, handlers);
  }

  public isBatchSafeGetPath(pathname: string): boolean {
    const route = this.routes.find((entry) => entry.method === 'GET' && entry.regex.test(pathname));
    return route?.batchSafe ?? true;
  }

  private async parseBody(req: IncomingMessage): Promise<any> {
    const method = req.method?.toUpperCase();
    if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') {
      return null;
    }

    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('application/json')) {
      return null;
    }

    return new Promise((resolve, reject) => {
      let totalBytes = 0;
      const chunks: Buffer[] = [];

      req.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_BODY_SIZE_BYTES) {
          req.destroy();
          return reject(new Error('PAYLOAD_TOO_LARGE'));
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        if (chunks.length === 0) {
          return resolve(null);
        }
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          if (!raw.trim()) {
            return resolve(null);
          }
          const parsed = JSON.parse(raw);
          resolve(parsed);
        } catch {
          reject(new Error('INVALID_JSON'));
        }
      });

      req.on('error', (err) => reject(err));
    });
  }

  public async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const host = req.headers.host || '127.0.0.1';
    const parsedUrl = new URL(req.url || '/', `http://${host}`);
    const pathname = parsedUrl.pathname;
    const method = req.method?.toUpperCase() || 'GET';

    const query: Record<string, string> = {};
    parsedUrl.searchParams.forEach((val, key) => {
      query[key] = val;
    });

    const apiReq = req as ApiRequest;
    apiReq.query = query;
    apiReq.path = pathname;
    apiReq.params = {};

    try {
      apiReq.body = await this.parseBody(req);
    } catch (err: any) {
      if (err.message === 'PAYLOAD_TOO_LARGE') {
        return errorResponse(res, 'PAYLOAD_TOO_LARGE', 'Request payload exceeds 1MB limit', 413);
      }
      return errorResponse(res, 'INVALID_JSON', 'Malformed JSON in request body', 400);
    }

    // Match route
    let matchedRoute: RouteEntry | null = null;
    const params: Record<string, string> = {};

    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = pathname.match(route.regex);
      if (match) {
        matchedRoute = route;
        route.paramNames.forEach((name, index) => {
          const matchedVal = match[index + 1];
          if (matchedVal !== undefined) {
            params[name] = decodeURIComponent(matchedVal);
          }
        });
        break;
      }
    }

    apiReq.params = params;

    // Execute middleware chain then handler
    let index = 0;
    const allMiddlewares = [...this.middlewares];

    const next = async (): Promise<void> => {
      if (index < allMiddlewares.length) {
        const mw = allMiddlewares[index++]!;
        await mw(apiReq, res, next);
      } else if (matchedRoute) {
        for (const handler of matchedRoute.handlers) {
          if (res.writableEnded) break;
          await handler(apiReq, res);
        }
      } else {
        if (method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tenant-ID, X-Request-ID, X-User-ID'
          });
          res.end();
          return;
        }
        errorResponse(res, 'NOT_FOUND', `Route ${method} ${pathname} not found`, 404);
      }
    };

    try {
      await next();
    } catch (error: any) {
      if (!res.writableEnded) {
        errorResponse(
          res,
          error.code || 'INTERNAL_ERROR',
          error.message || 'An unexpected internal server error occurred',
          error.statusCode || 500
        );
      }
    }
  }
}
