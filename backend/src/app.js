import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import { query } from './db/pool.js';
import { openapi } from './docs/openapi.js';
import { manejarErrores, noEncontrado } from './middleware/errores.js';
import auth from './routes/auth.js';
import usuarios from './routes/usuarios.js';
import catalogos from './routes/catalogos.js';
import citas from './routes/citas.js';
import historias from './routes/historias.js';
import notificaciones from './routes/notificaciones.js';
import reportes from './routes/reportes.js';

export const app = express();

app.set('trust proxy', 1); // detrás del proxy del hosting (Render, etc.)
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.corsOrigen === '*' ? true : config.corsOrigen.split(',') }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ estado: 'ok', baseDatos: 'conectada', hora: new Date().toISOString() });
  } catch {
    res.status(503).json({ estado: 'error', baseDatos: 'sin conexión' });
  }
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'API Citas Médicas' }));
app.get('/api-docs.json', (_req, res) => res.json(openapi));

app.use('/api/auth', auth);
app.use('/api/usuarios', usuarios);
app.use('/api', catalogos);
app.use('/api/citas', citas);
app.use('/api/historias', historias);
app.use('/api/notificaciones', notificaciones);
app.use('/api/reportes', reportes);

// Si existe el frontend compilado (../frontend/dist), se sirve desde el mismo servidor
const carpeta = dirname(fileURLToPath(import.meta.url));
const dist = join(carpeta, '..', '..', 'frontend', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(join(dist, 'index.html')));
}

app.use('/api', noEncontrado);
app.use(manejarErrores);
