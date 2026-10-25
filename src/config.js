import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export function readConfig() {
  const port = Number(process.env.PORT || 3000);
  const sessionHours = Number(process.env.SESSION_HOURS || 12);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1-65535.');
  if (!Number.isFinite(sessionHours) || sessionHours <= 0 || sessionHours > 168) {
    throw new Error('SESSION_HOURS must be greater than 0 and at most 168.');
  }
  const appOrigin = process.env.APP_ORIGIN || `http://localhost:${port}`;
  if (new URL(appOrigin).origin !== appOrigin) throw new Error('APP_ORIGIN must be an exact origin, without a trailing slash.');
  const secure = process.env.COOKIE_SECURE || 'false';
  if (!['true', 'false'].includes(secure)) throw new Error('COOKIE_SECURE must be true or false.');
  if (appOrigin.startsWith('https:') && secure !== 'true') throw new Error('HTTPS requires COOKIE_SECURE=true.');
  const databasePath = path.resolve(projectRoot, process.env.DATABASE_PATH || 'data/art-studio.sqlite');
  const publicPath = path.join(projectRoot, 'public');
  const relative = path.relative(publicPath, databasePath);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    throw new Error('DATABASE_PATH must be outside public/.');
  }
  return { port, host: process.env.HOST || '127.0.0.1', databasePath, appOrigin,
    cookieSecure: secure === 'true', sessionHours };
}
