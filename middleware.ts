// Vercel Routing Middleware: nothing (page, scripts, API) is served without the password session.
// Runs before the CDN cache for every path.
import { next } from '@vercel/functions';
import { isAuthed, json, passwordConfigured } from './server/auth.js';
import { loginPage, setupPage } from './server/pages.js';

const OPEN = new Set(['/api/login', '/api/session', '/robots.txt']);

function page(html: string, status: number) {
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' },
  });
}

export default async function middleware(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (OPEN.has(path)) return next();
  const api = path.startsWith('/api/');
  if (!passwordConfigured()) return api ? json({ error: 'not_configured' }, 503) : page(setupPage(), 503);
  if (await isAuthed(request)) return next();
  return api ? json({ error: 'auth' }, 401) : page(loginPage(), 401);
}
