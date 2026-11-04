CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','worker','client'))
);
CREATE TABLE IF NOT EXISTS services(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT, category TEXT, description TEXT, image_url TEXT, price_from TEXT
);
CREATE TABLE IF NOT EXISTS works(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, place TEXT, description TEXT, image_url TEXT, year TEXT
);
CREATE TABLE IF NOT EXISTS reservations(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER, worker_id INTEGER, service_id INTEGER,
  date TEXT NOT NULL, time TEXT NOT NULL, duration INTEGER,
  address TEXT, notes TEXT, status TEXT,
  kind TEXT NOT NULL DEFAULT 'cotizacion',
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(worker_id) REFERENCES users(id),
  FOREIGN KEY(service_id) REFERENCES services(id)
);
CREATE INDEX IF NOT EXISTS idx_res_date_time ON reservations(date, time);
