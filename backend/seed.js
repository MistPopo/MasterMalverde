// Crea la base de datos con datos de demostración. Borra lo anterior.
// Uso: npm run seed
import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbFile = path.join(__dirname, 'data.sqlite');
if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

const db = new sqlite3.Database(dbFile);
const run = (sql, params = []) => new Promise((res, rej) =>
  db.run(sql, params, function (e) { e ? rej(e) : res(this); }));
const all = (sql, params = []) => new Promise((res, rej) =>
  db.all(sql, params, (e, rows) => e ? rej(e) : res(rows)));

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

async function seed() {
  await new Promise((res, rej) => db.exec(schema, e => e ? rej(e) : res()));

  const pass = bcrypt.hashSync('cambiar-esta-clave', 10);
  const users = [
    ['Administrador', 'admin@mmalv.cl', 'admin'],
    ['Trabajador Uno', 'worker@mmalv.cl', 'worker'],
    ['Cliente Demo', 'cliente@mmalv.cl', 'client'],
  ];
  for (const [n, e, r] of users) await run('INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,?)', [n, e, pass, r]);

  // Imágenes por URL, igual que en la versión original
  const services = [
    ['Remodelación de cocina', 'Obra menor', 'Optimización de espacio y terminaciones.', 'https://images.unsplash.com/photo-1507089947368-19c1da9775ae', '$1.500.000+'],
    ['Cambio de tablero eléctrico', 'Electricidad', 'Normalización SEC y protecciones.', 'https://images.unsplash.com/photo-1581092795360-1b92f5a97f3e', '$250.000+'],
    ['Pintura exterior casa', 'Pintura', 'Lavado, sellos y pintura esmalte.', 'https://images.unsplash.com/photo-1499951360447-b19be8fe80f5', '$450.000+'],
    ['Impermeabilización de techumbre', 'Estructuras', 'Detección de filtraciones y reparación de techos.', 'https://images.unsplash.com/photo-1503387762-592deb58ef4e', '$600.000+'],
    ['Gasfitería integral', 'Gasfitería', 'Reparaciones y diagnóstico de fugas.', 'https://images.unsplash.com/photo-1581578017425-ec07294e8550', '$120.000+'],
  ];
  for (const [t, c, d, img, p] of services) {
    await run('INSERT INTO services(title,category,description,image_url,price_from) VALUES (?,?,?,?,?)', [t, c, d, img, p]);
  }

  const works = [
    ['Remodelación de cocina', 'Providencia', 'Nueva distribución, muebles y terminaciones.', '2025'],
    ['Techumbre con filtraciones', 'Puente Alto', 'Diagnóstico y reparación completa del techo.', '2025'],
    ['Pintura de fachada', 'La Florida', 'Lavado, sellado y pintura exterior.', '2024'],
  ];
  for (const [t, p, d, y] of works) {
    await run('INSERT INTO works(title,place,description,image_url,year) VALUES (?,?,?,?,?)', [t, p, d, '', y]);
  }

  console.log('Datos de demostración creados.');
  console.log('Admin: admin@mmalv.cl  | Trabajador: worker@mmalv.cl  | Cliente: cliente@mmalv.cl');
  console.log('Clave de demostración: cambiar-esta-clave (cámbiala antes de publicar).');
  db.close();
}
seed().catch(e => { console.error(e); process.exit(1); });
