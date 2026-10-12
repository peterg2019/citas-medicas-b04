import { query } from '../db/pool.js';

// Registra acciones sensibles. La tabla es inmutable (trigger en la base de datos).
export async function auditar(req, accion, entidad = null, entidadId = null, detalle = null) {
  try {
    await query(
      `INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle, ip)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.user?.id ?? null, accion, entidad, entidadId, detalle ? JSON.stringify(detalle) : null, req.ip]
    );
  } catch (error) {
    console.error('No se pudo registrar auditoría:', error.message);
  }
}
