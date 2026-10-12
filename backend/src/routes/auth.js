import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { query, transaccion } from '../db/pool.js';
import { autenticar, firmarToken, SQL_USUARIO } from '../middleware/auth.js';
import { HttpError } from '../utils/errores.js';
import { auditar } from '../utils/auditoria.js';
import { texto, correo, clave, datosPaciente } from '../utils/esquemas.js';

const router = Router();

// Protección contra fuerza bruta en el inicio de sesión
const limitarLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.limiteLogin,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en 15 minutos.' },
});

const HASH_FALSO = bcrypt.hashSync('contraseña-inexistente', 10);

const esquemaRegistro = z.object({
  nombre: texto('El nombre'),
  apellido: texto('El apellido'),
  correo,
  password: clave,
  ...datosPaciente,
});

const esquemaLogin = z.object({
  correo,
  password: z.string().min(1, 'La contraseña es obligatoria.'),
});

const publico = (u) => ({
  id: u.id, nombre: u.nombre, apellido: u.apellido, correo: u.correo,
  rol: u.rol, paciente_id: u.paciente_id, medico_id: u.medico_id,
});

// RF-01: el registro público crea únicamente usuarios con rol paciente
router.post('/registro', async (req, res) => {
  const d = esquemaRegistro.parse(req.body);
  const hash = await bcrypt.hash(d.password, 10);

  const usuarioId = await transaccion(async (c) => {
    const dup = await c.query('SELECT 1 FROM usuarios WHERE lower(correo) = $1', [d.correo]);
    if (dup.rowCount) throw new HttpError(409, 'Ya existe una cuenta con ese correo.');
    const doc = await c.query('SELECT 1 FROM pacientes WHERE documento = $1', [d.documento]);
    if (doc.rowCount) throw new HttpError(409, 'Ya existe un paciente con ese documento.');

    const u = await c.query(
      `INSERT INTO usuarios (nombre, apellido, correo, password_hash, rol_id)
       VALUES ($1,$2,$3,$4,(SELECT id FROM roles WHERE nombre = 'paciente')) RETURNING id`,
      [d.nombre, d.apellido, d.correo, hash]
    );
    const p = await c.query(
      `INSERT INTO pacientes (usuario_id, documento, telefono, direccion, fecha_nacimiento)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [u.rows[0].id, d.documento, d.telefono ?? null, d.direccion ?? null, d.fecha_nacimiento ?? null]
    );
    await c.query('INSERT INTO historias_clinicas (paciente_id) VALUES ($1)', [p.rows[0].id]);
    return u.rows[0].id;
  });

  const { rows } = await query(`${SQL_USUARIO} WHERE u.id = $1`, [usuarioId]);
  req.user = rows[0];
  await auditar(req, 'registro_paciente', 'usuario', usuarioId);
  res.status(201).json({ token: firmarToken(usuarioId), usuario: publico(rows[0]) });
});

router.post('/login', limitarLogin, async (req, res) => {
  const d = esquemaLogin.parse(req.body);
  const { rows } = await query(
    `${SQL_USUARIO.replace('u.activo,', 'u.activo, u.password_hash,')} WHERE lower(u.correo) = $1`,
    [d.correo]
  );
  const u = rows[0];
  const valido = await bcrypt.compare(d.password, u?.password_hash ?? HASH_FALSO);
  if (!u || !valido || !u.activo) {
    await auditar(req, 'login_fallido', 'usuario', u?.id ?? null, { correo: d.correo });
    throw new HttpError(401, 'Correo o contraseña incorrectos.');
  }
  req.user = u;
  await auditar(req, 'login', 'usuario', u.id);
  res.json({ token: firmarToken(u.id), usuario: publico(u) });
});

router.get('/me', autenticar, (req, res) => {
  res.json({ usuario: publico(req.user) });
});

export default router;
