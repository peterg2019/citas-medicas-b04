import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, transaccion } from '../db/pool.js';
import { autenticar, permitirRoles } from '../middleware/auth.js';
import { HttpError } from '../utils/errores.js';
import { auditar } from '../utils/auditoria.js';
import { texto, correo, clave, idEntero, datosPaciente } from '../utils/esquemas.js';

const router = Router();
router.use(autenticar, permitirRoles('administrador'));

const esquemaCrear = z.object({
  nombre: texto('El nombre'),
  apellido: texto('El apellido'),
  correo,
  password: clave,
  rol: z.enum(['paciente', 'medico', 'administrador'], { error: 'Rol inválido.' }),
  especialidad_id: idEntero.optional(),
  registro_medico: z.string().trim().max(30).optional(),
  documento: z.string().trim().max(20).optional(),
  telefono: datosPaciente.telefono,
  direccion: datosPaciente.direccion,
  fecha_nacimiento: datosPaciente.fecha_nacimiento,
});

const esquemaEditar = z.object({
  nombre: texto('El nombre').optional(),
  apellido: texto('El apellido').optional(),
  activo: z.boolean().optional(),
  especialidad_id: idEntero.optional(),
});

const SQL_LISTA = `
  SELECT u.id, u.nombre, u.apellido, u.correo, u.activo, r.nombre AS rol,
         to_char(u.creado_en, 'YYYY-MM-DD') AS creado_en,
         p.id AS paciente_id, m.id AS medico_id, e.nombre AS especialidad
  FROM usuarios u
  JOIN roles r ON r.id = u.rol_id
  LEFT JOIN pacientes p ON p.usuario_id = u.id
  LEFT JOIN medicos m ON m.usuario_id = u.id
  LEFT JOIN especialidades e ON e.id = m.especialidad_id`;

router.get('/', async (req, res) => {
  const { rol, q } = req.query;
  const filtros = [];
  const params = [];
  if (rol) { params.push(rol); filtros.push(`r.nombre = $${params.length}`); }
  if (q) {
    params.push(`%${String(q).toLowerCase()}%`);
    filtros.push(`(lower(u.nombre || ' ' || u.apellido) LIKE $${params.length} OR lower(u.correo) LIKE $${params.length})`);
  }
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const { rows } = await query(`${SQL_LISTA} ${where} ORDER BY u.id`, params);
  res.json({ usuarios: rows });
});

// RF-05: el administrador crea usuarios de cualquier rol
router.post('/', async (req, res) => {
  const d = esquemaCrear.parse(req.body);
  if (d.rol === 'medico' && !d.especialidad_id) {
    throw new HttpError(400, 'Un médico requiere especialidad_id.');
  }
  if (d.rol === 'paciente' && !d.documento) {
    throw new HttpError(400, 'Un paciente requiere documento.');
  }
  const hash = await bcrypt.hash(d.password, 10);

  const id = await transaccion(async (c) => {
    const dup = await c.query('SELECT 1 FROM usuarios WHERE lower(correo) = $1', [d.correo]);
    if (dup.rowCount) throw new HttpError(409, 'Ya existe una cuenta con ese correo.');
    const u = await c.query(
      `INSERT INTO usuarios (nombre, apellido, correo, password_hash, rol_id)
       VALUES ($1,$2,$3,$4,(SELECT id FROM roles WHERE nombre = $5)) RETURNING id`,
      [d.nombre, d.apellido, d.correo, hash, d.rol]
    );
    const uid = u.rows[0].id;
    if (d.rol === 'medico') {
      const esp = await c.query('SELECT 1 FROM especialidades WHERE id = $1', [d.especialidad_id]);
      if (!esp.rowCount) throw new HttpError(400, 'La especialidad indicada no existe.');
      await c.query('INSERT INTO medicos (usuario_id, especialidad_id, registro_medico) VALUES ($1,$2,$3)',
        [uid, d.especialidad_id, d.registro_medico ?? null]);
    }
    if (d.rol === 'paciente') {
      const p = await c.query(
        `INSERT INTO pacientes (usuario_id, documento, telefono, direccion, fecha_nacimiento)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [uid, d.documento, d.telefono ?? null, d.direccion ?? null, d.fecha_nacimiento ?? null]
      );
      await c.query('INSERT INTO historias_clinicas (paciente_id) VALUES ($1)', [p.rows[0].id]);
    }
    return uid;
  });

  await auditar(req, 'crear_usuario', 'usuario', id, { rol: d.rol });
  const { rows } = await query(`${SQL_LISTA} WHERE u.id = $1`, [id]);
  res.status(201).json({ usuario: rows[0] });
});

router.patch('/:id', async (req, res) => {
  const id = idEntero.parse(req.params.id);
  const d = esquemaEditar.parse(req.body);
  if (d.activo === false && id === req.user.id) {
    throw new HttpError(400, 'No puedes desactivar tu propia cuenta.');
  }
  await transaccion(async (c) => {
    const existe = await c.query('SELECT 1 FROM usuarios WHERE id = $1', [id]);
    if (!existe.rowCount) throw new HttpError(404, 'Usuario no encontrado.');
    await c.query(
      `UPDATE usuarios SET nombre = COALESCE($2, nombre), apellido = COALESCE($3, apellido),
                           activo = COALESCE($4, activo) WHERE id = $1`,
      [id, d.nombre ?? null, d.apellido ?? null, d.activo ?? null]
    );
    if (d.especialidad_id) {
      const r = await c.query('UPDATE medicos SET especialidad_id = $2 WHERE usuario_id = $1', [id, d.especialidad_id]);
      if (!r.rowCount) throw new HttpError(400, 'El usuario no es médico.');
    }
  });
  await auditar(req, 'editar_usuario', 'usuario', id, d);
  const { rows } = await query(`${SQL_LISTA} WHERE u.id = $1`, [id]);
  res.json({ usuario: rows[0] });
});

export default router;
