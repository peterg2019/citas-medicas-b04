import { Router } from 'express';
import { query } from '../db/pool.js';
import { autenticar, permitirRoles } from '../middleware/auth.js';
import { ahora } from '../services/agenda.js';

const router = Router();
router.use(autenticar, permitirRoles('administrador'));

// RF-05: información consolidada de usuarios y citas
router.get('/resumen', async (_req, res) => {
  const hoy = ahora().fecha;
  const [usuarios, estados, especialidades, porDia, tot] = await Promise.all([
    query(`SELECT r.nombre AS rol, count(*)::int AS total FROM usuarios u JOIN roles r ON r.id = u.rol_id
           WHERE u.activo GROUP BY r.nombre ORDER BY r.nombre`),
    query(`SELECT estado, count(*)::int AS total FROM citas GROUP BY estado ORDER BY estado`),
    query(`SELECT e.nombre AS especialidad, count(*)::int AS total
           FROM citas c JOIN medicos m ON m.id = c.medico_id JOIN especialidades e ON e.id = m.especialidad_id
           WHERE c.estado <> 'cancelada' GROUP BY e.nombre ORDER BY total DESC, e.nombre`),
    query(`SELECT to_char(fecha,'YYYY-MM-DD') AS fecha, count(*)::int AS total FROM citas
           WHERE estado <> 'cancelada' AND fecha BETWEEN $1::date AND $1::date + 13
           GROUP BY fecha ORDER BY fecha`, [hoy]),
    query(`SELECT count(*)::int AS total FROM citas`),
  ]);
  res.json({
    generado_para: hoy,
    total_citas: tot.rows[0].total,
    usuarios_por_rol: usuarios.rows,
    citas_por_estado: estados.rows,
    citas_por_especialidad: especialidades.rows,
    citas_proximos_14_dias: porDia.rows,
  });
});

// Consulta del registro de auditoría (trazabilidad exigida en RNF-01)
router.get('/auditoria', async (req, res) => {
  const limite = Math.min(Number(req.query.limite) || 100, 500);
  const { rows } = await query(
    `SELECT a.id, a.fecha, a.accion, a.entidad, a.entidad_id, a.detalle, a.ip,
            u.correo AS usuario
     FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
     ORDER BY a.id DESC LIMIT $1`, [limite]);
  res.json({ auditoria: rows });
});

export default router;
