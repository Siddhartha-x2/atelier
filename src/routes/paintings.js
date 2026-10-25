import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { requireRole } from '../auth.js';
import * as v from '../validation.js';

const paintingColumns = `id,title,artist,description,price_paise / 100.0 AS price,
  image_url AS imageUrl,status`;

// List originals for either role; only the studio can add/edit an available work.
export function paintingRoutes(db) {
  const router = Router();
  const studio = requireRole('studio');
  router.get('/', (req, res) => {
    res.json(db.prepare(`SELECT ${paintingColumns} FROM paintings ORDER BY id`).all());
  });
  function paintingInput(body) {
    const title = v.text(body.title, 'Title', 300);
    const artist = v.text(body.artist, 'Artist', 100);
    const description = v.text(body.description, 'Description', 3000);
    const price = v.number(body.price, 'Price', 0.01, 10000000);
    const paise = Math.round(price * 100);
    if (Math.abs(price * 100 - paise) > 0.00001)
      v.fail(400, 'Price may have at most two decimal places.');
    const imageUrl = body.imageUrl;
    if (typeof imageUrl !== 'string' || !/^\/images\/p-(00[1-9]|01[0-2])\.jpg$/.test(imageUrl)) {
      v.fail(400, 'Choose one of the supplied images.');
    }
    return [title, artist, description, paise, imageUrl];
  }
  router.post('/', studio, (req, res) => {
    const values = paintingInput(req.body);
    const id = `p-${randomUUID()}`;
    db.prepare("INSERT INTO paintings VALUES(?,?,?,?,?,?,'available')").run(id, ...values);
    res.status(201).json(db.prepare(`SELECT ${paintingColumns} FROM paintings WHERE id=?`).get(id));
  });
  router.put('/:id', studio, (req, res) => {
    const id = v.paintingId(req.params.id);
    const values = paintingInput(req.body);
    const result = db
      .prepare(
        `UPDATE paintings SET title=?,artist=?,description=?,price_paise=?,image_url=?
      WHERE id=? AND status='available'`
      )
      .run(...values, id);
    if (!result.changes) {
      if (!db.prepare('SELECT id FROM paintings WHERE id=?').get(id))
        v.fail(404, 'Painting not found.');
      v.fail(409, 'This painting is sold and can no longer be edited.');
    }
    res.json(db.prepare(`SELECT ${paintingColumns} FROM paintings WHERE id=?`).get(id));
  });

  return router;
}
