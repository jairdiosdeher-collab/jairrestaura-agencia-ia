import type { IncomingMessage, ServerResponse } from 'node:http';
import { app } from '../server.ts';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.url) {
    const parsed = new URL(req.url, 'http://localhost');
    const vercelPath = parsed.searchParams.get('__vercel_path');

    if (vercelPath) {
      parsed.searchParams.delete('__vercel_path');
      const normalized = vercelPath.startsWith('/') ? vercelPath : `/${vercelPath}`;
      const remainingQuery = parsed.searchParams.toString();
      req.url = `/api${normalized}${remainingQuery ? `?${remainingQuery}` : ''}`;
    } else if (req.url === '/api/index' || req.url.startsWith('/api/index?')) {
      const remainingQuery = parsed.searchParams.toString();
      req.url = `/api/health${remainingQuery ? `?${remainingQuery}` : ''}`;
    } else if (!req.url.startsWith('/api/')) {
      const normalized = req.url.startsWith('/') ? req.url : `/${req.url}`;
      req.url = `/api${normalized}`;
    }
  }

  return app(
    req as unknown as Parameters<typeof app>[0],
    res as unknown as Parameters<typeof app>[1],
  );
}
