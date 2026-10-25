import { Router } from 'express';
import { requireRole } from '../auth.js';
import { transaction } from '../db.js';
import * as v from '../validation.js';

// JOINs add the painting caption and customer details to the saved order.
const orderDetails = `SELECT o.id,o.user_id AS userId,u.name AS customerName,u.email AS customerEmail,
    o.painting_id AS paintingId,p.title,p.image_url AS imageUrl,o.price_paise / 100.0 AS price,
    o.status,o.created_at AS createdAt FROM orders o JOIN paintings p ON p.id=o.painting_id
    JOIN users u ON u.id=o.user_id`;

export function orderRoutes(db, now) {
  const router = Router();
  const customer = requireRole('customer');
  // The logged-in user supplies ownership. Body/query userId values are ignored.
  function findOrder(req) {
    const id = v.recordId(req.params.id);
    let row;
    if (req.user.role === 'studio') {
      row = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
    } else {
      row = db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(id, req.user.id);
    }
    if (!row) v.fail(404, 'Record not found.');
    return row;
  }

  router.get('/', (req, res) => {
    let rows;
    if (req.user.role === 'studio') {
      rows = db.prepare(orderDetails + ' ORDER BY o.id DESC').all();
    } else {
      rows = db.prepare(orderDetails + ' WHERE o.user_id=? ORDER BY o.id DESC').all(req.user.id);
    }
    res.json(rows);
  });

  router.get('/:id', (req, res) => {
    const row = findOrder(req);
    res.json(db.prepare(orderDetails + ' WHERE o.id=?').get(row.id));
  });

  // Buying changes TWO tables. The transaction keeps those changes together.
  router.post('/', customer, (req, res) => {
    const id = v.paintingId(req.body.paintingId);
    const orderId = transaction(db, () => {
      const painting = db.prepare('SELECT * FROM paintings WHERE id=?').get(id);
      if (!painting) v.fail(404, 'Painting not found.');
      const change = db
        .prepare("UPDATE paintings SET status='sold' WHERE id=? AND status='available'")
        .run(id);
      if (!change.changes) v.fail(409, 'This painting has just sold. Please choose another.');
      return db
        .prepare(
          `INSERT INTO orders(user_id,painting_id,price_paise,status,created_at)
        VALUES(?,?,?,'placed',?)`
        )
        .run(req.user.id, id, painting.price_paise, now().toISOString()).lastInsertRowid;
    });
    res.status(201).json(db.prepare(`${orderDetails} WHERE o.id=?`).get(orderId));
  });
  router.post('/:id/cancel', customer, (req, res) => {
    transaction(db, () => {
      const order = findOrder(req);
      const change = db
        .prepare(
          "UPDATE orders SET status='cancelled' WHERE id=? AND user_id=? AND status='placed'"
        )
        .run(order.id, req.user.id);
      if (!change.changes) v.fail(409, 'Only a placed order can be cancelled.');
      const painting = db
        .prepare("UPDATE paintings SET status='available' WHERE id=? AND status='sold'")
        .run(order.painting_id);
      if (!painting.changes) v.fail(409, 'The painting state changed. Please refresh.');
    });
    res.json({ message: 'Order cancelled. The painting is available again.' });
  });

  return router;
}
