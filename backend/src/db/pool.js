import pg from 'pg';
import { config } from '../config.js';

// Las fechas (DATE) se devuelven como texto 'YYYY-MM-DD' para evitar desfases de zona horaria.
pg.types.setTypeParser(1082, (valor) => valor);

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  max: 10,
});

export const query = (texto, parametros) => pool.query(texto, parametros);

export async function transaccion(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}
