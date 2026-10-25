import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { openDatabase, transaction } from './db.js';
import { hashPassword } from './passwords.js';
import { readConfig } from './config.js';

export const seedData = JSON.parse(readFileSync(new URL('../seed/seed.json', import.meta.url), 'utf8'));

export async function seedDatabase(db, studioPassword = process.env.STUDIO_PASSWORD) {
  const existing = db.prepare('SELECT role FROM users WHERE email = ?').get(seedData.studioAccount.email);
  if (existing && existing.role !== 'studio') throw new Error('The supplied studio email is already a customer. Seed a fresh database first.');
  // Only a new studio account needs a locally chosen password. Re-seeding never resets it.
  let passwordHash;
  if (!existing) {
    if (typeof studioPassword !== 'string' || studioPassword.length < 10 || studioPassword.length > 128 ||
        studioPassword === '<choose-a-10-to-128-character-password>') {
      throw new Error('Set STUDIO_PASSWORD to your own 10-128 character password in .env before the first seed.');
    }
    // Hashing is asynchronous; do it before the synchronous transaction.
    passwordHash = await hashPassword(studioPassword);
  }
  transaction(db, () => {
    const account = db.prepare('SELECT role FROM users WHERE email = ?').get(seedData.studioAccount.email);
    if (account && account.role !== 'studio') throw new Error('The supplied studio email is already a customer. Seed a fresh database first.');
    if (!account) {
      if (!passwordHash) throw new Error('The studio account changed. Set STUDIO_PASSWORD and seed again.');
      db.prepare(`INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'studio')`)
        .run('Art Studio', seedData.studioAccount.email, passwordHash);
    }
    const painting = db.prepare(`INSERT INTO paintings(id,title,artist,description,price_paise,image_url,status)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`);
    for (const p of seedData.paintings) painting.run(p.id, p.title, p.artist, p.description,
      Math.round(p.price * 100), `/${p.imageUrl}`, p.status);
    for (const item of seedData.potteryItems) {
      db.prepare('INSERT INTO pottery_items VALUES(?,?) ON CONFLICT(id) DO NOTHING').run(item.id, item.name);
    }
    for (const glaze of seedData.glazes) {
      db.prepare('INSERT INTO glazes VALUES(?,?) ON CONFLICT(id) DO NOTHING').run(glaze.id, glaze.name);
    }
    db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO NOTHING')
      .run('wall_rate_paise', Math.round(seedData.mural.ratePerSqFt * 100));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = readConfig();
  const db = openDatabase(config.databasePath);
  try {
    await seedDatabase(db);
    console.log('Seed complete. Existing paintings, accounts and activity were preserved.');
  } finally { db.close(); }
}
