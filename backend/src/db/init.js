import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './pool.js';

const carpeta = dirname(fileURLToPath(import.meta.url));
const reiniciar = process.argv.includes('--reset');

try {
  if (reiniciar) {
    console.log('Eliminando tablas existentes...');
    await pool.query(`
      DROP TABLE IF EXISTS auditoria, registros_clinicos, historias_clinicas, notificaciones,
        citas, medicos, pacientes, especialidades, usuarios, roles CASCADE;
      DROP FUNCTION IF EXISTS bloquear_modificacion() CASCADE;`);
  }
  await pool.query(readFileSync(join(carpeta, 'schema.sql'), 'utf8'));
  await pool.query(`INSERT INTO roles (nombre) VALUES ('paciente'),('medico'),('administrador')
                    ON CONFLICT (nombre) DO NOTHING`);
  console.log('Base de datos lista (tablas y roles creados).');
} catch (error) {
  console.error('Error inicializando la base de datos:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
