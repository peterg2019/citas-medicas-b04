import { Router } from 'express';
import { z } from 'zod';
import { query, transaccion } from '../db/pool.js';
import { autenticar, permitirRoles } from '../middleware/auth.js';
import { HttpError } from '../utils/errores.js';
import { auditar } from '../utils/auditoria.js';
import { cifrar, descifrar } from '../utils/cifrado.js';
import { idEntero } from '../utils/esquemas.js';

const router = Router();
// RF-03: solo pacientes (su propia historia) y médicos autorizados. El administrador NO accede al contenido clínico.
router.use(autenticar, permitirRoles('paciente', 'medico'));

const esquemaRegistro = z.object({
  diagnostico: z.string({ error: 'El diagnóstico es obligatorio.' }).trim().min(1, 'El diagnóstico es obligatorio.').max(4000),
  tratamiento: z.string().trim().max(4000).optional(),
  notas: z.string().trim().max(4000).optional(),
  cita_id: idEntero.optional(),
  corrige_registro_id: idEntero.optional(),
});

// Un médico está autorizado si tiene (o tuvo) citas no canceladas con ese paciente
async function autorizar(req, pacienteId) {
  if (req.user.rol === 'paciente') {
    if (req.user.paciente_id !== pacienteId) throw new HttpError(403, 'Solo puedes consultar tu propia historia clínica.');
    return;
  }
  const { rowCount } = await query(
    `SELECT 1 FROM citas WHERE medico_id = $1 AND paciente_id = $2 AND estado <> 'cancelada' LIMIT 1`,
    [req.user.medico_id, pacienteId]);
  if (!rowCount) throw new HttpError(403, 'No estás autorizado: no tienes citas con este paciente.');
}

router.get('/paciente/:pacienteId', async (req, res) => {
  const pacienteId = idEntero.parse(req.params.pacienteId);
  await autorizar(req, pacienteId);

  const cab = await query(
    `SELECT h.id AS historia_id, p.id AS paciente_id, u.nombre, u.apellido, p.documento,
            to_char(p.fecha_nacimiento,'YYYY-MM-DD') AS fecha_nacimiento
     FROM historias_clinicas h JOIN pacientes p ON p.id = h.paciente_id JOIN usuarios u ON u.id = p.usuario_id
     WHERE p.id = $1`, [pacienteId]);
  if (!cab.rows[0]) throw new HttpError(404, 'Historia clínica no encontrada.');

  const { rows } = await query(
    `SELECT r.id, r.fecha_registro, r.cita_id, r.corrige_registro_id, r.diagnostico, r.tratamiento, r.notas,
            um.nombre || ' ' || um.apellido AS medico, e.nombre AS especialidad
     FROM registros_clinicos r
     JOIN medicos m ON m.id = r.medico_id JOIN usuarios um ON um.id = m.usuario_id
     JOIN especialidades e ON e.id = m.especialidad_id
     WHERE r.historia_id = $1 ORDER BY r.fecha_registro DESC, r.id DESC`, [cab.rows[0].historia_id]);

  await auditar(req, 'consultar_historia', 'historia', cab.rows[0].historia_id, { paciente_id: pacienteId });
  res.json({
    paciente: { id: pacienteId, nombre: `${cab.rows[0].nombre} ${cab.rows[0].apellido}`,
                documento: cab.rows[0].documento, fecha_nacimiento: cab.rows[0].fecha_nacimiento },
    historia_id: cab.rows[0].historia_id,
    registros: rows.map((r) => ({
      ...r,
      diagnostico: descifrar(r.diagnostico),
      tratamiento: descifrar(r.tratamiento),
      notas: descifrar(r.notas),
    })),
  });
});

// Agrega un registro nuevo (nunca se edita ni se borra uno existente: para corregir se crea otro que lo referencia)
router.post('/paciente/:pacienteId/registros', permitirRoles('medico'), async (req, res) => {
  const pacienteId = idEntero.parse(req.params.pacienteId);
  const d = esquemaRegistro.parse(req.body);
  await autorizar(req, pacienteId);

  const nuevo = await transaccion(async (c) => {
    const h = await c.query('SELECT id FROM historias_clinicas WHERE paciente_id = $1', [pacienteId]);
    if (!h.rows[0]) throw new HttpError(404, 'Historia clínica no encontrada.');
    const historiaId = h.rows[0].id;

    if (d.cita_id) {
      const ci = await c.query(
        `SELECT estado FROM citas WHERE id = $1 AND paciente_id = $2 AND medico_id = $3`,
        [d.cita_id, pacienteId, req.user.medico_id]);
      if (!ci.rows[0]) throw new HttpError(400, 'La cita indicada no corresponde a este médico y paciente.');
      if (['programada', 'reprogramada'].includes(ci.rows[0].estado)) {
        await c.query(`UPDATE citas SET estado = 'atendida', actualizada_en = now() WHERE id = $1`, [d.cita_id]);
      }
    }
    if (d.corrige_registro_id) {
      const rc = await c.query('SELECT 1 FROM registros_clinicos WHERE id = $1 AND historia_id = $2',
        [d.corrige_registro_id, historiaId]);
      if (!rc.rowCount) throw new HttpError(400, 'El registro a corregir no pertenece a esta historia.');
    }
    const r = await c.query(
      `INSERT INTO registros_clinicos (historia_id, medico_id, cita_id, diagnostico, tratamiento, notas, corrige_registro_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, fecha_registro`,
      [historiaId, req.user.medico_id, d.cita_id ?? null, cifrar(d.diagnostico), cifrar(d.tratamiento),
       cifrar(d.notas), d.corrige_registro_id ?? null]);
    return { ...r.rows[0], historia_id: historiaId };
  });

  await auditar(req, 'crear_registro_clinico', 'registro_clinico', nuevo.id, { paciente_id: pacienteId });
  res.status(201).json({ registro: { id: nuevo.id, fecha_registro: nuevo.fecha_registro, historia_id: nuevo.historia_id } });
});

export default router;
