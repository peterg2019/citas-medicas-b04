import { app } from './app.js';
import { config } from './config.js';
import { pool } from './db/pool.js';

const servidor = app.listen(config.puerto, () => {
  console.log(`API de Citas Médicas escuchando en http://localhost:${config.puerto}`);
  console.log(`Documentación Swagger:      http://localhost:${config.puerto}/api-docs`);
});

const cerrar = async () => {
  servidor.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
