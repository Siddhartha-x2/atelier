PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('customer', 'studio'))
) STRICT;
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS paintings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  description TEXT NOT NULL,
  price_paise INTEGER NOT NULL CHECK(price_paise > 0),
  image_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('available', 'sold'))
) STRICT;
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  painting_id TEXT NOT NULL REFERENCES paintings(id),
  price_paise INTEGER NOT NULL CHECK(price_paise > 0),
  status TEXT NOT NULL CHECK(status IN ('placed', 'cancelled')),
  created_at TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS one_active_order_per_painting
  ON orders(painting_id) WHERE status = 'placed';
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS pottery_items (id TEXT PRIMARY KEY, name TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS glazes (id TEXT PRIMARY KEY, name TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  wall_size REAL NOT NULL CHECK(wall_size BETWEEN 10 AND 500),
  address TEXT NOT NULL CHECK(length(trim(address)) > 0),
  rate_paise INTEGER NOT NULL CHECK(rate_paise > 0),
  total_paise INTEGER NOT NULL CHECK(total_paise > 0),
  status TEXT NOT NULL CHECK(status IN ('requested', 'confirmed', 'declined', 'cancelled')),
  created_at TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS one_active_booking_per_date
  ON bookings(date) WHERE status IN ('requested', 'confirmed');
CREATE TABLE IF NOT EXISTS pottery_requests (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  item_id TEXT NOT NULL REFERENCES pottery_items(id),
  glaze_id TEXT NOT NULL REFERENCES glazes(id),
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 12),
  needed_by TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('requested', 'accepted', 'declined', 'cancelled')),
  created_at TEXT NOT NULL
) STRICT;
