# MasterMalverde — Agenda de cotizaciones y galería de trabajos

Sitio para mostrar trabajos realizados y agendar una visita de cotización en terreno.

## Tecnologías
- Backend: Node.js, Express, SQLite (sqlite3), JWT, bcryptjs
- Frontend: HTML, CSS y JavaScript sin frameworks (`frontend/`)

## Cómo correr
```bash
cd backend
cp .env.example .env        # y cambia JWT_SECRET por una clave larga y propia
npm install
npm run seed                # crea la base de datos con datos de demostración
npm start                   # abre http://localhost:3000
```

Cuentas de demostración (contraseña `cambiar-esta-clave`, cámbiala antes de publicar):
admin@mmalv.cl, worker@mmalv.cl, cliente@mmalv.cl

## Roles
- **Cliente:** se registra, agenda visitas y cancela las suyas.
- **Trabajador:** ve sus visitas asignadas y actualiza su estado.
- **Administrador:** gestiona servicios, trabajos, usuarios y asigna trabajadores.

## Endpoints principales
| Método | Ruta | Descripción |
|---|---|---|
| GET | /api/availability?month=YYYY-MM | Horas libres por día |
| GET | /api/availability/day?date=YYYY-MM-DD | Horas de un día |
| POST | /api/reservations | Agenda una visita (cliente) |
| GET | /api/works | Trabajos realizados |
| GET | /api/catalog | Servicios |

## Pendientes
- Subida de fotos (hoy se cargan por URL).
- Notificaciones por correo al confirmar una visita.
