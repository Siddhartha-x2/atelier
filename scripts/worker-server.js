// Separate OS process used only by the integration tests for contention/restarts.
import { createApp } from '../src/app.js';

const { app, db } = createApp({ databasePath: process.argv[2], appOrigin: null,
  cookieSecure: false, sessionHours: 12, now: () => new Date('2026-10-22T10:00:00Z') });
const server = app.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ port: server.address().port })));
process.on('SIGTERM', () => server.close(() => { db.close(); process.exit(); }));
