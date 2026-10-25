import { Router } from 'express';
import { transaction } from '../db.js';
import { hashPassword, verifyPassword } from '../passwords.js';
import { createSession, setSessionCookie, removeSession } from '../auth.js';
import * as v from '../validation.js';

// These paths are mounted under /api/auth in app.js.
export function authRoutes(db, config, now) {
  const router = Router();
  router.post('/signup', async (req, res) => {
    const name = v.text(req.body.name, 'Name', 100);
    const email = v.email(req.body.email);
    const password = v.password(req.body.password);
    // The studio address is reserved even before the first seed run.
    if (email === 'studio@artstudio.in')
      v.fail(409, 'This email is reserved for the supplied studio account.');
    const passwordHash = await hashPassword(password);
    let created;
    try {
      // A body.role or body.userId is deliberately ignored.
      created = transaction(db, () => {
        const id = db
          .prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'customer')")
          .run(name, email, passwordHash).lastInsertRowid;
        return { id, session: createSession(db, req, id, config, now()) };
      });
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed: users.email'))
        v.fail(409, 'An account with this email already exists.');
      throw error;
    }
    setSessionCookie(res, created.session, config);
    res.status(201).json({ id: Number(created.id), name, email, role: 'customer' });
  });
  router.post('/login', async (req, res) => {
    const email = v.email(req.body.email);
    const password = v.password(req.body.password);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !(await verifyPassword(password, user.password_hash)))
      v.fail(401, 'Email or password is incorrect.');
    const session = transaction(db, () => createSession(db, req, user.id, config, now()));
    setSessionCookie(res, session, config);
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  });

  router.get('/me', (req, res) => res.json(req.user));
  router.post('/logout', (req, res) => {
    removeSession(db, req, res, config);
    res.json({ message: 'Logged out.' });
  });

  return router;
}
