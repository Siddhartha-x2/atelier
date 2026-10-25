import { Router } from 'express';
import { requireRole } from '../auth.js';
import { transaction } from '../db.js';
import * as v from '../validation.js';

const bookingDetails = `SELECT o.id,o.user_id AS userId,u.name AS customerName,u.email AS customerEmail,
    o.date,o.wall_size AS wallSize,o.address,o.rate_paise / 100.0 AS rate,
    o.total_paise / 100.0 AS total,o.status,o.created_at AS createdAt FROM bookings o
    JOIN users u ON u.id=o.user_id`;

export function bookingRoutes(db, now) {
  const router = Router();
  const customer = requireRole('customer');
  const studio = requireRole('studio');
  const today = () => v.kolkataToday(now());
  // The logged-in user supplies ownership. Body/query userId values are ignored.
  function findBooking(req) {
    const id = v.recordId(req.params.id);
    let row;
    if (req.user.role === 'studio') {
      row = db.prepare('SELECT * FROM bookings WHERE id=?').get(id);
    } else {
      row = db.prepare('SELECT * FROM bookings WHERE id=? AND user_id=?').get(id, req.user.id);
    }
    if (!row) v.fail(404, 'Record not found.');
    return row;
  }

  router.get('/', (req, res) => {
    let rows;
    if (req.user.role === 'studio') {
      rows = db.prepare(bookingDetails + ' ORDER BY o.id DESC').all();
    } else {
      rows = db.prepare(bookingDetails + ' WHERE o.user_id=? ORDER BY o.id DESC').all(req.user.id);
    }
    res.json(rows);
  });

  router.get('/:id', (req, res) => {
    const row = findBooking(req);
    res.json(db.prepare(bookingDetails + ' WHERE o.id=?').get(row.id));
  });

  // The server calculates price. The unique date index handles competing requests.
  router.post('/', customer, (req, res) => {
    const date = v.dateAway(req.body.date, today(), 7, 90);
    const size = v.number(req.body.wallSize, 'Wall size', 10, 500);
    const address = v.text(req.body.address, 'Address', 1000);
    const rate = db.prepare("SELECT value FROM settings WHERE key='wall_rate_paise'").get();
    if (!rate) v.fail(503, 'Run npm run seed before creating a booking.');
    let id;
    try {
      id = db
        .prepare(
          `INSERT INTO bookings(user_id,date,wall_size,address,rate_paise,total_paise,status,created_at)
        VALUES(?,?,?,?,?,?,'requested',?)`
        )
        .run(
          req.user.id,
          date,
          size,
          address,
          rate.value,
          Math.round(size * rate.value),
          now().toISOString()
        ).lastInsertRowid;
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed'))
        v.fail(409, 'That date is already reserved. Please choose another.');
      throw error;
    }
    res.status(201).json(db.prepare(`${bookingDetails} WHERE o.id=?`).get(id));
  });
  router.post('/:id/cancel', customer, (req, res) => {
    transaction(db, () => {
      const booking = findBooking(req);
      if (v.calendarDay(booking.date) - v.calendarDay(today()) < 3) {
        v.fail(
          409,
          'Bookings can be cancelled only until three calendar days before the date (Kolkata time).'
        );
      }
      const change = db
        .prepare(
          `UPDATE bookings SET status='cancelled' WHERE id=? AND user_id=?
        AND status IN ('requested','confirmed')`
        )
        .run(booking.id, req.user.id);
      if (!change.changes) v.fail(409, 'Only requested or confirmed bookings can be cancelled.');
    });
    res.json({ message: 'Booking cancelled. The date is available again.' });
  });
  router.post('/:id/decision', studio, (req, res) => {
    const status = req.body.status;
    if (!['confirmed', 'declined'].includes(status)) v.fail(400, 'Choose confirmed or declined.');
    const row = findBooking(req);
    const change = db
      .prepare("UPDATE bookings SET status=? WHERE id=? AND status='requested'")
      .run(status, row.id);
    if (!change.changes) v.fail(409, 'Only requested bookings can be confirmed or declined.');
    res.json({ message: `Booking ${status}.` });
  });

  return router;
}
