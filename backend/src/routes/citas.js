import { Router } from 'express';
import { z } from 'zod';
import { query, transaccion } from '../db/pool.js';
import { autenticar, permitirRoles } from '../middleware/auth.js';
import { HttpError } from '../utils/errores.js';
import { auditar } from '../utils/auditoria.js';
import { idEntero, fecha, hora } from '../utils/esquemas.js';
import { validarFranja } from '../services/agenda.js';
import { notificarCita } from '../services/notificaciones.js';

const router = Router();
router.use(autenticar);

const SQL_CITA = `
  SELECT c.id, to_char(c.fecha,'YYYY-MM-DD') AS fecha, to_char(c.hora,'HH24:MI') AS hora,
         c.motivo, c.estado, c.paciente_id, up.nombre || ' ' || up.apellido AS paciente,
         c.medico_id, um.nombre || ' ' || um.apellido AS medico, e.nombre AS especialidad
  FROM citas c
  JOIN pacientes p ON p.id = c.paciente_id JOIN usuarios up ON up.id = p.usuario_id
  JOIN medicos m ON m.id = c.medico_id JOIN usuarios um ON um.id = m.usuario_id
  JOIN especialidades e ON e.id = m.especialidad_id`;

const esquemaCrear = z.object({
  medico_id: idEntero,
  fecha,
  hora,
  motivo: z.string().trim().max(250).optional(),
  paciente_id: idEntero.optional(), // solo lo usa el administrador
});
const esquemaFranja = z.object({ fecha, hora });

// Traduce las violaciones de los índices únicos en mensajes claros (sin reserva doble)
function traducirConflicto(error) {
  if (error.code === '23505') {
    if (error.constraint === 'ux_cita_medico_franja') {
      return new HttpError(409, 'El médico ya tiene una cita en esa franja horaria.');
    }
    if (error.constraint === 'ux_cita_paciente_franja') {
      return new HttpError(409, 'El paciente ya tiene una cita en ese horario.');
    }
  }
  return error;
}

async function cargarCitaAutorizada(req) {
  const id = idEntero.parse(req.params.id);
  const { rows } = await query(`${SQL_CITA} WHERE c.id = $1`, [id]);
  const cita = rows[0];
  if (!cita) throw new HttpError(404, 'Cita no encontrada.');
  const { rol, paciente_id, medico_id } = req.user;
  const permitido =
    rol === 'administrador' ||
    (rol === 'paciente' && cita.paciente_id === paciente_id) ||
    (rol === 'medico' && cita.medico_id === medico_id);
  if (!permitido) throw new HttpError(403, 'No tienes acceso a esta cita.');
  return cita;
}

// RF-02: agendar cita
router.post('/', permitirRoles('paciente', 'administrador'), async (req, res) => {
  const d = esquemaCrear.parse(req.body);
  const pacienteId = req.user.rol === 'paciente' ? req.user.paciente_id : d.paciente_id;
  if (!pacienteId) throw new HttpError(400, 'El administrador debe indicar paciente_id.');

  validarFranja(d.fecha, d.hora);
  const medico = await query(
    `SELECT 1 FROM medicos m JOIN usuarios u ON u.id = m.usuario_id WHERE m.id = $1 AND u.activo`, [d.medico_id]);
  if (!medico.rowCount) throw new HttpError(404, 'Médico no encontrado.');
  const paciente = await query('SELECT 1 FROM pacientes WHERE id = $1', [pacienteId]);
  if (!paciente.rowCount) throw new HttpError(404, 'Paciente no encontrado.');

  let id;
  try {
    const r = await query(
      `INSERT INTO citas (paciente_id, medico_id, fecha, hora, motivo)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [pacienteId, d.medico_id, d.fecha, d.hora, d.motivo ?? null]);
    id = r.rows[0].id;
  } catch (error) {
    throw traducirConflicto(error);
  }
  await auditar(req, 'crear_cita', 'cita', id);
  await notificarCita(id, 'creada');
  const { rows } = await query(`${SQL_CITA} WHERE c.id = $1`, [id]);
  res.status(201).json({ cita: rows[0] });
});

// Listado según el rol: paciente (las suyas), médico (su agenda), administrador (todas)
router.get('/', async (req, res) => {
  const filtros = [];
  const params = [];
  const agregar = (sql, valor) => { params.push(valor); filtros.push(sql.replace('?', `$${params.length}`)); };

  if (req.user.rol === 'paciente') agregar('c.paciente_id = ?', req.user.paciente_id);
  if (req.user.rol === 'medico') agregar('c.medico_id = ?', req.user.medico_id);
  if (req.query.estado) agregar('c.estado = ?', z.enum(['programada', 'reprogramada', 'cancelada', 'atendida']).parse(req.query.estado));
  if (req.query.desde) agregar('c.fecha >= ?', fecha.parse(req.query.desde));
  if (req.query.hasta) agregar('c.fecha <= ?', fecha.parse(req.query.hasta));
  if (req.query.medico_id && req.user.rol === 'administrador') agregar('c.medico_id = ?', idEntero.parse(req.query.medico_id));

  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const { rows } = await query(`${SQL_CITA} ${where} ORDER BY c.fecha, c.hora`, params);
  res.json({ citas: rows });
});

router.get('/:id', async (req, res) => {
  res.json({ cita: await cargarCitaAutorizada(req) });
});

// RF-02: reprogramar
router.patch('/:id/reprogramar', permitirRoles('paciente', 'administrador'), async (req, res) => {
  const cita = await cargarCitaAutorizada(req);
  const d = esquemaFranja.parse(req.body);
  if (!['programada', 'reprogramada'].includes(cita.estado)) {
    throw new HttpError(409, `No se puede reprogramar una cita en estado "${cita.estado}".`);
  }
  validarFranja(d.fecha, d.hora);
  try {
    await query(
      `UPDATE citas SET fecha = $2, hora = $3, estado = 'reprogramada', actualizada_en = now() WHERE id = $1`,
      [cita.id, d.fecha, d.hora]);
  } catch (error) {
    throw traducirConflicto(error);
  }
  await auditar(req, 'reprogramar_cita', 'cita', cita.id, { de: `${cita.fecha} ${cita.hora}`, a: `${d.fecha} ${d.hora}` });
  await notificarCita(cita.id, 'reprogramada');
  const { rows } = await query(`${SQL_CITA} WHERE c.id = $1`, [cita.id]);
  res.json({ cita: rows[0] });
});

// RF-02: cancelar
router.patch('/:id/cancelar', async (req, res) => {
  const cita = await cargarCitaAutorizada(req);
  if (!['programada', 'reprogramada'].includes(cita.estado)) {
    throw new HttpError(409, `No se puede cancelar una cita en estado "${cita.estado}".`);
  }
  await query(`UPDATE citas SET estado = 'cancelada', actualizada_en = now() WHERE id = $1`, [cita.id]);
  await auditar(req, 'cancelar_cita', 'cita', cita.id);
  await notificarCita(cita.id, 'cancelada');
  const { rows } = await query(`${SQL_CITA} WHERE c.id = $1`, [cita.id]);
  res.json({ cita: rows[0] });
});

// El médico marca la cita como atendida
router.patch('/:id/atender', permitirRoles('medico'), async (req, res) => {
  const cita = await cargarCitaAutorizada(req);
  if (!['programada', 'reprogramada'].includes(cita.estado)) {
    throw new HttpError(409, `No se puede atender una cita en estado "${cita.estado}".`);
  }
  await query(`UPDATE citas SET estado = 'atendida', actualizada_en = now() WHERE id = $1`, [cita.id]);
  await auditar(req, 'atender_cita', 'cita', cita.id);
  const { rows } = await query(`${SQL_CITA} WHERE c.id = $1`, [cita.id]);
  res.json({ cita: rows[0] });
});

export default router;
