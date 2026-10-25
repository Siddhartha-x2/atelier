import { randomBytes, createHash } from 'node:crypto';
import { fail } from './validation.js';

export const cookieName = 'artstudio_session';
const digest = token => createHash('sha256').update(token).digest('hex');

export function sessionToken(req) {
  const value = (req.headers.cookie || '').split(';').map(part => part.trim())
    .find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

export function cookieOptions(config) {
  return { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', path: '/' };
}

// Call inside the caller's transaction so rotation and account creation can
// roll back together. Set the browser cookie only after that transaction commits.
export function createSession(db, req, userId, config, now) {
  const old = sessionToken(req);
  if (old) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(old));
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now.getTime());
  const token = randomBytes(32).toString('hex');
  const duration = config.sessionHours * 60 * 60 * 1000;
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token), userId, now.getTime() + duration);
  return { token, duration };
}

export function setSessionCookie(res, session, config) {
  res.cookie(cookieName, session.token, { ...cookieOptions(config), maxAge: session.duration });
}

export function removeSession(db, req, res, config) {
  const token = sessionToken(req);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(token));
  res.clearCookie(cookieName, cookieOptions(config));
}

export function requireUser(db, now) {
  return (req, res, next) => {
    const token = sessionToken(req);
    const user = token && db.prepare(`SELECT u.id,u.name,u.email,u.role FROM sessions s
      JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`)
      .get(digest(token), now().getTime());
    if (!user) return res.status(401).json({ error: 'Please log in to continue.' });
    req.user = user;
    next();
  };
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) fail(403, `This action is only available to ${role} accounts.`);
    next();
  };
}
