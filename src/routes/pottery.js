import { Router } from 'express';
import { requireRole } from '../auth.js';
import * as v from '../validation.js';

const potteryDetails = `SELECT o.id,o.user_id AS userId,u.name AS customerName,u.email AS customerEmail,
    o.item_id AS itemId,i.name AS item,o.glaze_id AS glazeId,g.name AS glaze,o.quantity,
    o.needed_by AS neededBy,o.status,o.created_at AS createdAt FROM pottery_requests o
    JOIN users u ON u.id=o.user_id JOIN pottery_items i ON i.id=o.item_id
    JOIN glazes g ON g.id=o.glaze_id`;

export function potteryRoutes(db, now) {
  const router = Router();
  const customer = requireRole('customer');
  const studio = requireRole('studio');
  const today = () => v.kolkataToday(now());
  // The logged-in user supplies ownership. Body/query userId values are ignored.
  function findPotteryRequest(req) {
    const id = v.recordId(req.params.id);
    let row;
    if (req.user.role === 'studio') {
      row = db.prepare('SELECT * FROM pottery_requests WHERE id=?').get(id);
    } else {
      row = db
        .prepare('SELECT * FROM pottery_requests WHERE id=? AND user_id=?')
        .get(id, req.user.id);
    }
    if (!row) v.fail(404, 'Record not found.');
    return row;
  }

  router.get('/', (req, res) => {
    let rows;
    if (req.user.role === 'studio') {
      rows = db.prepare(potteryDetails + ' ORDER BY o.id DESC').all();
    } else {
      rows = db.prepare(potteryDetails + ' WHERE o.user_id=? ORDER BY o.id DESC').all(req.user.id);
    }
    res.json(rows);
  });

  router.get('/:id', (req, res) => {
    const row = findPotteryRequest(req);
    res.json(db.prepare(potteryDetails + ' WHERE o.id=?').get(row.id));
  });

  // Every customer edit/cancel and studio decision is guarded by requested status.
  function potteryInput(body) {
    if (
      typeof body.itemId !== 'string' ||
      !db.prepare('SELECT id FROM pottery_items WHERE id=?').get(body.itemId)
    ) {
      v.fail(400, 'Choose an item from the supplied list.');
    }
    if (
      typeof body.glazeId !== 'string' ||
      !db.prepare('SELECT id FROM glazes WHERE id=?').get(body.glazeId)
    ) {
      v.fail(400, 'Choose a glaze from the supplied list.');
    }
    const quantity = v.number(body.quantity, 'Quantity', 1, 12, true);
    const neededBy = v.dateAway(body.neededBy, today(), 14);
    return [body.itemId, body.glazeId, quantity, neededBy];
  }
  router.post('/', customer, (req, res) => {
    const values = potteryInput(req.body);
    const id = db
      .prepare(
        `INSERT INTO pottery_requests(user_id,item_id,glaze_id,quantity,needed_by,status,created_at)
      VALUES(?,?,?,?,?,'requested',?)`
      )
      .run(req.user.id, ...values, now().toISOString()).lastInsertRowid;
    res.status(201).json(db.prepare(`${potteryDetails} WHERE o.id=?`).get(id));
  });
  router.put('/:id', customer, (req, res) => {
    const row = findPotteryRequest(req);
    const values = potteryInput(req.body);
    const change = db
      .prepare(
        `UPDATE pottery_requests SET item_id=?,glaze_id=?,quantity=?,needed_by=?
      WHERE id=? AND user_id=? AND status='requested'`
      )
      .run(...values, row.id, req.user.id);
    if (!change.changes) v.fail(409, 'Only requested pottery can be edited.');
    res.json(db.prepare(`${potteryDetails} WHERE o.id=?`).get(row.id));
  });
  router.post('/:id/cancel', customer, (req, res) => {
    const row = findPotteryRequest(req);
    const change = db
      .prepare(
        `UPDATE pottery_requests SET status='cancelled'
      WHERE id=? AND user_id=? AND status='requested'`
      )
      .run(row.id, req.user.id);
    if (!change.changes) v.fail(409, 'Only requested pottery can be cancelled.');
    res.json({ message: 'Pottery request cancelled.' });
  });
  router.post('/:id/decision', studio, (req, res) => {
    const status = req.body.status;
    if (!['accepted', 'declined'].includes(status)) v.fail(400, 'Choose accepted or declined.');
    const row = findPotteryRequest(req);
    const change = db
      .prepare("UPDATE pottery_requests SET status=? WHERE id=? AND status='requested'")
      .run(status, row.id);
    if (!change.changes) v.fail(409, 'Only requested pottery can be accepted or declined.');
    res.json({ message: `Pottery request ${status}.` });
  });

  return router;
}
