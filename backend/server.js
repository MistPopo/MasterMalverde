import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  console.error('Falta JWT_SECRET (mínimo 16 caracteres) en backend/.env. Ver .env.example');
  process.exit(1);
}

// Horario de atención: horas de inicio disponibles para cotizaciones / trabajos
const SLOT_HOURS = ['09:00','10:00','11:00','12:00','14:00','15:00','16:00','17:00'];
const SLOT_MINUTES = 60;
const MAX_DAYS_AHEAD = 90;

const app = express();
const db = new sqlite3.Database(path.join(__dirname, 'data.sqlite'));

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

// ---------- helpers ----------
const run = (sql, params = []) => new Promise((resolve, reject) =>
  db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));
const get = (sql, params = []) => new Promise((resolve, reject) =>
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
const all = (sql, params = []) => new Promise((resolve, reject) =>
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function authRequired(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Inicia sesión para continuar' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Tu sesión venció, vuelve a iniciar sesión' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    next();
  };
}

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const isTime = (s) => typeof s === 'string' && SLOT_HOURS.includes(s);
const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
function dateInRange(s) {
  if (s < todayISO()) return 'La fecha ya pasó';
  const max = new Date(); max.setDate(max.getDate() + MAX_DAYS_AHEAD);
  if (s > max.toISOString().slice(0, 10)) return `Solo se agenda hasta ${MAX_DAYS_AHEAD} días adelante`;
  return null;
}
const clean = (s, max) => String(s ?? '').trim().slice(0, max);

// ---------- auth ----------
app.post('/api/auth/register', wrap(async (req, res) => {
  const name = clean(req.body.name, 80);
  const email = clean(req.body.email, 120).toLowerCase();
  const password = String(req.body.password ?? '');
  if (!name || !email || password.length < 6) {
    return res.status(400).json({ error: 'Completa nombre, correo y una contraseña de al menos 6 caracteres' });
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'El correo no es válido' });
  if (await get('SELECT id FROM users WHERE email=?', [email])) {
    return res.status(409).json({ error: 'Ese correo ya está registrado' });
  }
  // Registro público: siempre cliente. Trabajadores y admin los crea el administrador.
  const hash = bcrypt.hashSync(password, 10);
  const { lastID } = await run('INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,?)', [name, email, hash, 'client']);
  const user = { id: lastID, name, email, role: 'client' };
  res.json({ token: jwt.sign(user, JWT_SECRET, { expiresIn: '7d' }), user });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const email = clean(req.body.email, 120).toLowerCase();
  const user = await get('SELECT id,name,email,role,password_hash FROM users WHERE email=?', [email]);
  if (!user || !bcrypt.compareSync(String(req.body.password ?? ''), user.password_hash)) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  }
  const payload = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.json({ token: jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' }), user: payload });
}));

app.get('/api/me', authRequired, wrap(async (req, res) => {
  const user = await get('SELECT id,name,email,role FROM users WHERE id=?', [req.user.id]);
  res.json({ user });
}));

// ---------- catálogo de servicios ----------
app.get('/api/catalog', wrap(async (req, res) => {
  res.json(await all('SELECT * FROM services ORDER BY id'));
}));
app.post('/api/catalog', authRequired, requireRole('admin'), wrap(async (req, res) => {
  const b = req.body;
  const { lastID } = await run('INSERT INTO services(title,category,description,image_url,price_from) VALUES (?,?,?,?,?)',
    [clean(b.title, 120) || 'Servicio', clean(b.category, 60) || 'General', clean(b.description, 500),
     clean(b.image_url, 300), clean(b.price_from, 40)]);
  res.json(await get('SELECT * FROM services WHERE id=?', [lastID]));
}));
app.patch('/api/catalog/:id', authRequired, requireRole('admin'), wrap(async (req, res) => {
  const b = req.body;
  if (!(await get('SELECT id FROM services WHERE id=?', [req.params.id]))) return res.status(404).json({ error: 'Servicio no encontrado' });
  await run('UPDATE services SET title=?, category=?, description=?, image_url=?, price_from=? WHERE id=?',
    [clean(b.title, 120) || 'Servicio', clean(b.category, 60) || 'General', clean(b.description, 500),
     clean(b.image_url, 300), clean(b.price_from, 40), req.params.id]);
  res.json(await get('SELECT * FROM services WHERE id=?', [req.params.id]));
}));
app.delete('/api/catalog/:id', authRequired, requireRole('admin'), wrap(async (req, res) => {
  await run('DELETE FROM services WHERE id=?', [req.params.id]);
  res.json({ ok: true });
}));

// ---------- trabajos realizados (galería pública) ----------
app.get('/api/works', wrap(async (req, res) => {
  res.json(await all('SELECT * FROM works ORDER BY id DESC'));
}));
app.post('/api/works', authRequired, requireRole('admin'), wrap(async (req, res) => {
  const b = req.body;
  const title = clean(b.title, 120);
  if (!title) return res.status(400).json({ error: 'El trabajo necesita un título' });
  const { lastID } = await run('INSERT INTO works(title,place,description,image_url,year) VALUES (?,?,?,?,?)',
    [title, clean(b.place, 120), clean(b.description, 500), clean(b.image_url, 300), clean(b.year, 4)]);
  res.json(await get('SELECT * FROM works WHERE id=?', [lastID]));
}));
app.patch('/api/works/:id', authRequired, requireRole('admin'), wrap(async (req, res) => {
  const b = req.body;
  const title = clean(b.title, 120);
  if (!title) return res.status(400).json({ error: 'El trabajo necesita un título' });
  if (!(await get('SELECT id FROM works WHERE id=?', [req.params.id]))) return res.status(404).json({ error: 'Trabajo no encontrado' });
  await run('UPDATE works SET title=?, place=?, description=?, image_url=?, year=? WHERE id=?',
    [title, clean(b.place, 120), clean(b.description, 500), clean(b.image_url, 300), clean(b.year, 4), req.params.id]);
  res.json(await get('SELECT * FROM works WHERE id=?', [req.params.id]));
}));
app.delete('/api/works/:id', authRequired, requireRole('admin'), wrap(async (req, res) => {
  await run('DELETE FROM works WHERE id=?', [req.params.id]);
  res.json({ ok: true });
}));

// ---------- disponibilidad (público, sin datos personales) ----------
// Devuelve, para cada día del mes, cuántas horas quedan libres.
app.get('/api/availability', wrap(async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : todayISO().slice(0, 7);
  const rows = await all("SELECT date, time FROM reservations WHERE substr(date,1,7)=? AND status!='canceled'", [month]);
  const booked = {};
  for (const r of rows) (booked[r.date] ||= new Set()).add(r.time);
  const days = {};
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const taken = booked[iso]?.size || 0;
    days[iso] = { free: SLOT_HOURS.length - taken, total: SLOT_HOURS.length };
  }
  res.json({ month, slots: SLOT_HOURS, days });
}));

// Horas libres de un día concreto
app.get('/api/availability/day', wrap(async (req, res) => {
  const date = req.query.date;
  if (!isDate(date)) return res.status(400).json({ error: 'Fecha inválida' });
  const rows = await all("SELECT time FROM reservations WHERE date=? AND status!='canceled'", [date]);
  const taken = new Set(rows.map(r => r.time));
  res.json({ date, slots: SLOT_HOURS.map(t => ({ time: t, free: !taken.has(t) })) });
}));

// ---------- reservas ----------
app.get('/api/reservations/mine', authRequired, wrap(async (req, res) => {
  res.json(await all(`SELECT r.*, s.title AS service_title FROM reservations r
    LEFT JOIN services s ON s.id=r.service_id WHERE r.user_id=? ORDER BY r.date, r.time`, [req.user.id]));
}));

app.get('/api/reservations/assigned', authRequired, requireRole('worker'), wrap(async (req, res) => {
  res.json(await all(`SELECT r.*, s.title AS service_title FROM reservations r
    LEFT JOIN services s ON s.id=r.service_id WHERE r.worker_id=? ORDER BY r.date, r.time`, [req.user.id]));
}));

app.get('/api/reservations/admin', authRequired, requireRole('admin'), wrap(async (req, res) => {
  res.json(await all(`SELECT r.*, u.name AS customer_name, u.email AS customer_email,
    s.title AS service_title, w.name AS worker_name
    FROM reservations r LEFT JOIN users u ON u.id=r.user_id
    LEFT JOIN services s ON s.id=r.service_id LEFT JOIN users w ON w.id=r.worker_id
    ORDER BY r.date, r.time`));
}));

app.post('/api/reservations', authRequired, requireRole('client', 'admin'), wrap(async (req, res) => {
  const b = req.body;
  const date = b.date, time = b.time;
  if (!isDate(date) || !isTime(time)) return res.status(400).json({ error: 'Elige un día y una hora disponibles' });
  const rangeErr = dateInRange(date);
  if (rangeErr) return res.status(400).json({ error: rangeErr });

  const serviceId = b.service_id ? Number(b.service_id) : null;
  if (serviceId && !(await get('SELECT id FROM services WHERE id=?', [serviceId]))) {
    return res.status(400).json({ error: 'El servicio seleccionado no existe' });
  }
  const address = clean(b.address, 200);
  if (!address) return res.status(400).json({ error: 'Indica la dirección del terreno' });

  // Un solo agendamiento por hora. Cualquier reserva activa en esa fecha y hora bloquea el horario.
  const conflict = await get("SELECT id FROM reservations WHERE date=? AND time=? AND status!='canceled'", [date, time]);
  if (conflict) return res.status(409).json({ error: 'Esa hora acaba de ser tomada. Elige otra.' });

  // worker_id solo lo asigna el administrador (no el cliente)
  const { lastID } = await run(`INSERT INTO reservations(user_id,service_id,worker_id,date,time,duration,address,notes,status,kind)
    VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [req.user.id, serviceId, null, date, time, SLOT_MINUTES, address, clean(b.notes, 500), 'scheduled',
     b.kind === 'trabajo' ? 'trabajo' : 'cotizacion']);
  res.json(await get('SELECT * FROM reservations WHERE id=?', [lastID]));
}));

app.delete('/api/reservations/:id', authRequired, wrap(async (req, res) => {
  const r = await get('SELECT * FROM reservations WHERE id=?', [req.params.id]);
  if (!r) return res.status(404).json({ error: 'Reserva no encontrada' });
  if (req.user.role !== 'admin' && r.user_id !== req.user.id) return res.status(403).json({ error: 'No puedes eliminar esta reserva' });
  await run('DELETE FROM reservations WHERE id=?', [req.params.id]);
  res.json({ ok: true });
}));

app.patch('/api/reservations/:id/status', authRequired, requireRole('worker', 'admin'), wrap(async (req, res) => {
  const allowed = ['scheduled', 'in_progress', 'done', 'canceled'];
  const status = req.body.status;
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Estado no válido' });
  const r = await get('SELECT * FROM reservations WHERE id=?', [req.params.id]);
  if (!r) return res.status(404).json({ error: 'Reserva no encontrada' });
  if (req.user.role === 'worker' && r.worker_id !== req.user.id) return res.status(403).json({ error: 'Esta reserva no está asignada a ti' });
  await run('UPDATE reservations SET status=? WHERE id=?', [status, req.params.id]);
  res.json(await get('SELECT * FROM reservations WHERE id=?', [req.params.id]));
}));

// Admin asigna trabajador a una reserva
app.patch('/api/reservations/:id/assign', authRequired, requireRole('admin'), wrap(async (req, res) => {
  const workerId = req.body.worker_id ? Number(req.body.worker_id) : null;
  if (workerId && !(await get("SELECT id FROM users WHERE id=? AND role='worker'", [workerId]))) {
    return res.status(400).json({ error: 'Trabajador no válido' });
  }
  await run('UPDATE reservations SET worker_id=? WHERE id=?', [workerId, req.params.id]);
  res.json(await get('SELECT * FROM reservations WHERE id=?', [req.params.id]));
}));

app.get('/api/users', authRequired, requireRole('admin'), wrap(async (req, res) => {
  res.json(await all("SELECT id,name,email,role FROM users ORDER BY role, name"));
}));
app.post('/api/users', authRequired, requireRole('admin'), wrap(async (req, res) => {
  const name = clean(req.body.name, 80), email = clean(req.body.email, 120).toLowerCase();
  const password = String(req.body.password ?? '');
  const role = ['worker', 'admin'].includes(req.body.role) ? req.body.role : null;
  if (!name || !email || password.length < 6 || !role) return res.status(400).json({ error: 'Datos incompletos para crear el usuario' });
  if (await get('SELECT id FROM users WHERE email=?', [email])) return res.status(409).json({ error: 'Ese correo ya existe' });
  const { lastID } = await run('INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,?)',
    [name, email, bcrypt.hashSync(password, 10), role]);
  res.json({ id: lastID, name, email, role });
}));
app.patch('/api/users/:id/role', authRequired, requireRole('admin'), wrap(async (req, res) => {
  const role = ['client', 'worker', 'admin'].includes(req.body.role) ? req.body.role : null;
  if (!role) return res.status(400).json({ error: 'Rol no válido' });
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'No puedes cambiar tu propio rol' });
  await run('UPDATE users SET role=? WHERE id=?', [role, req.params.id]);
  res.json(await get('SELECT id,name,email,role FROM users WHERE id=?', [req.params.id]));
}));
app.delete('/api/users/:id', authRequired, requireRole('admin'), wrap(async (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
  await run('UPDATE reservations SET worker_id=NULL WHERE worker_id=?', [req.params.id]);
  await run('DELETE FROM reservations WHERE user_id=?', [req.params.id]);
  await run('DELETE FROM users WHERE id=?', [req.params.id]);
  res.json({ ok: true });
}));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---------- esquema ----------
const schemaSQL = `
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
`;

db.exec(schemaSQL, (err) => {
  if (err) { console.error('Error de esquema', err); process.exit(1); }
  app.listen(PORT, () => console.log(`MasterMalverde corriendo en http://localhost:${PORT}`));
});
