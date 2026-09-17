import { IncomingMessage, ServerResponse } from 'node:http';
import { ApiClient } from './api-client.js';
import { Session } from './session.js';
import { SafeHtml } from './html.js';

export interface PageContext {
  req: IncomingMessage;
  res: ServerResponse;
  api: ApiClient;
  session: Session;
  url: URL;
  query: Record<string, string>;
  body: Record<string, any>;
  method: string;
}

export interface PageResult {
  title?: string;
  content: SafeHtml | string;
  redirect?: string;
  status?: number;
  isFullDocument?: boolean;
}

export type PageHandler = (ctx: PageContext) => Promise<PageResult | void>;
