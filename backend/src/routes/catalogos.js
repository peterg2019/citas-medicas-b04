import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { autenticar, permitirRoles } from '../middleware/auth.js';
import { HttpError } from '../utils/errores.js';
import { auditar } from '../utils/auditoria.js';
import { texto, idEntero, fecha } from '../utils/esquemas.js';
import { franjasDisponibles } from '../services/agenda.js';

const router = Router();
router.use(autenticar);

router.get('/especialidades', async (_req, res) => {
  const { rows } = await query('SELECT id, nombre FROM especialidades ORDER BY nombre');
  res.json({ especialidades: rows });
});

router.post('/especialidades', permitirRoles('administrador'), async (req, res) => {
  const { nombre } = z.object({ nombre: texto('El nombre', 80) }).parse(req.body);
  const { rows } = await query(
    `INSERT INTO especialidades (nombre) VALUES ($1)
     ON CONFLICT (nombre) DO NOTHING RETURNING id, nombre`, [nombre]);
  if (!rows[0]) throw new HttpError(409, 'Esa especialidad ya existe.');
  await auditar(req, 'crear_especialidad', 'especialidad', rows[0].id);
  res.status(201).json({ especialidad: rows[0] });
});

// RF-02: consultar médicos por especialidad
router.get('/medicos', async (req, res) => {
  const params = [];
  let filtro = '';
  if (req.query.especialidad_id) {
    params.push(idEntero.parse(req.query.especialidad_id));
    filtro = 'AND m.especialidad_id = $1';
  }
  const { rows } = await query(
    `SELECT m.id, u.nombre, u.apellido, m.especialidad_id, e.nombre AS especialidad
     FROM medicos m JOIN usuarios u ON u.id = m.usuario_id
     JOIN especialidades e ON e.id = m.especialidad_id
     WHERE u.activo = TRUE ${filtro} ORDER BY u.apellido, u.nombre`, params);
  res.json({ medicos: rows });
});

router.get('/medicos/:id/disponibilidad', async (req, res) => {
  const medicoId = idEntero.parse(req.params.id);
  const f = fecha.parse(req.query.fecha);
  const existe = await query(
    `SELECT 1 FROM medicos m JOIN usuarios u ON u.id = m.usuario_id WHERE m.id = $1 AND u.activo`, [medicoId]);
  if (!existe.rowCount) throw new HttpError(404, 'Médico no encontrado.');
  res.json({ medico_id: medicoId, fecha: f, disponibles: await franjasDisponibles(medicoId, f) });
});

export default router;
