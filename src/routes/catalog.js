import { Router } from 'express';
import { kolkataToday } from '../validation.js';

export function catalogRoutes(db, now) {
  const router = Router();
  const today = () => kolkataToday(now());
  router.get('/', (req, res) => {
    const rate = db.prepare("SELECT value FROM settings WHERE key='wall_rate_paise'").get();
    if (!rate) v.fail(503, 'The studio is not initialized. Run npm run seed.');
    res.json({
      today: today(),
      currency: 'INR',
      wallRate: rate.value / 100,
      items: db.prepare('SELECT * FROM pottery_items ORDER BY id').all(),
      glazes: db.prepare('SELECT * FROM glazes ORDER BY id').all(),
      images: Array.from(
        { length: 12 },
        (_, i) => `/images/p-${String(i + 1).padStart(3, '0')}.jpg`
      )
    });
  });

  return router;
}
