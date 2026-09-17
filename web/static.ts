import { IncomingMessage, ServerResponse } from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Root directory of the repository
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.resolve(rootDir, 'web', 'public');

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

/**
 * Handle static asset requests under `/public/*`.
 *
 * @param req Incoming HTTP request.
 * @param res Server response.
 * @param urlPath Parsed URL pathname.
 * @returns True if the request was handled as a static asset, false otherwise.
 */
export function serveStatic(req: IncomingMessage, res: ServerResponse, urlPath: string): boolean {
  if (!urlPath.startsWith('/public/')) {
    return false;
  }

  // Strip leading /public/ to resolve against web/public
  const relativeSubpath = urlPath.slice('/public/'.length);
  const normalized = path.normalize(relativeSubpath).replace(/^(\.\.[/\\])+/, '');
  const absoluteTarget = path.resolve(publicDir, normalized);

  // Security guard against path traversal attacks
  if (!absoluteTarget.startsWith(publicDir)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return true;
  }

  if (!fs.existsSync(absoluteTarget)) {
    res.statusCode = 404;
    res.end('Not Found');
    return true;
  }

  const stat = fs.statSync(absoluteTarget);
  if (!stat.isFile()) {
    res.statusCode = 404;
    res.end('Not Found');
    return true;
  }

  const ext = path.extname(absoluteTarget).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.statusCode = 200;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const stream = fs.createReadStream(absoluteTarget);
  stream.pipe(res);
  return true;
}

/**
 * Convenience wrapper for handleStaticFile(req, res).
 */
export function handleStaticFile(req: IncomingMessage, res: ServerResponse): boolean {
  const parsedUrl = new URL(req.url || '/', 'http://localhost');
  return serveStatic(req, res, parsedUrl.pathname);
}

