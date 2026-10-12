# Sistema Web de Gestión de Citas Médicas e Historias Clínicas

Backend (API REST) del proyecto de Gerencia de Proyectos Informáticos. Implementa los requisitos
RF-01 a RF-05 y RNF-01 a RNF-05 definidos en las entregas anteriores.

**Tecnologías:** Node.js 20+ · Express 5 · PostgreSQL · JWT · bcrypt · AES-256-GCM · Swagger (OpenAPI 3)

## 1. Requisitos
- Node.js 20 o superior (`node -v` para verificar)
- Una base de datos PostgreSQL (elige UNA de las dos opciones)

### Opción A — PostgreSQL local (Windows)
1. Instala PostgreSQL desde https://www.postgresql.org/download/windows/ y recuerda la contraseña del usuario `postgres`.
2. Abre **SQL Shell (psql)** o pgAdmin y ejecuta: `CREATE DATABASE citas_medicas;`
3. En `.env` pon: `DATABASE_URL=postgres://postgres:TU_CONTRASEÑA@localhost:5432/citas_medicas`

### Opción B — PostgreSQL en la nube, sin instalar nada (Neon)
1. Crea una cuenta gratuita en https://neon.tech y un proyecto nuevo.
2. Copia la cadena de conexión ("Connection string") en `DATABASE_URL` de tu `.env`.
3. Pon `DATABASE_SSL=true` en `.env`.

## 2. Puesta en marcha
Desde la carpeta `backend`:

```powershell
copy .env.example .env       # luego edita .env con tu DATABASE_URL
npm install
npm run db:reset             # crea las tablas
npm run db:seed              # carga datos de ejemplo
npm run dev                  # inicia el servidor en http://localhost:4000
```

- Documentación interactiva de la API (Swagger): http://localhost:4000/api-docs
- Estado del servicio: http://localhost:4000/api/health

## 3. Usuarios de ejemplo
Todos usan la contraseña `Demo2026*`

| Rol | Correo |
|---|---|
| Administrador | admin@clinica.test |
| Médicos | medico1@clinica.test … medico4@clinica.test |
| Pacientes | paciente1@clinica.test … paciente3@clinica.test |

## 4. Pruebas automáticas
```powershell
npm run db:reset
npm run db:seed
npm test
```
Verifican, entre otras cosas: no hay reserva doble (ni con peticiones simultáneas), la reserva responde en
menos de 2 s, el acceso a historias clínicas por rol, el cifrado de los datos clínicos, la inmutabilidad del
historial y la auditoría.

## 5. Cómo se cumplen los requisitos

| Requisito | Implementación |
|---|---|
| RF-01 Usuarios y roles | `/api/auth/*`, `/api/usuarios`; roles paciente, médico y administrador con control por rol |
| RF-02 Gestión de citas | `/api/citas`, `/api/medicos/:id/disponibilidad`; índice único en BD evita cruces de horario |
| RF-03 Historias clínicas | `/api/historias/*`; solo médicos con citas con el paciente, y el propio paciente |
| RF-04 Notificaciones | Se generan al crear, reprogramar y cancelar citas (`/api/notificaciones`) |
| RF-05 Administración y reportes | `/api/usuarios`, `/api/especialidades`, `/api/reportes/*` |
| RNF-01 Seguridad | JWT, contraseñas con bcrypt, datos clínicos cifrados con AES-256-GCM, auditoría, límite de intentos de login |
| RNF-02 Rendimiento | Consultas indexadas; prueba automática de reserva < 2 s |
| RNF-04 Integridad | Restricciones en BD, transacciones, historial y auditoría inmutables (triggers) |
| RNF-05 Documentación | Swagger en `/api-docs`, este README y el código comentado |

### Reglas de negocio
- Agenda de lunes a viernes, de 08:00 a 17:00, en franjas de 30 minutos (zona horaria de Colombia). Se puede cambiar en `.env`.
- No se agenda en el pasado ni en horas fuera de agenda.
- Un médico no puede tener dos citas en la misma franja, ni un paciente.
- El registro público crea únicamente pacientes; médicos y administradores los crea el administrador.
- El administrador **no** puede leer el contenido de las historias clínicas.
- Los registros clínicos no se editan ni se borran: una corrección es un registro nuevo que referencia al anterior.

### Limitaciones conocidas
- **SMS:** se registran como notificación `simulada` (no hay proveedor de SMS integrado).
- **Correo:** se envía de verdad solo si configuras `SMTP_*` en `.env`; si no, queda como `simulada`.

## 6. Estructura
```
backend/
  src/
    app.js, server.js, config.js
    db/         schema.sql, init.js, seed.js, pool.js
    routes/     auth, usuarios, catalogos, citas, historias, notificaciones, reportes
    services/   agenda.js, notificaciones.js
    middleware/ auth.js (JWT y roles), errores.js
    utils/      cifrado.js, auditoria.js, esquemas.js
    docs/       openapi.js (Swagger)
  tests/        api.test.js
```
