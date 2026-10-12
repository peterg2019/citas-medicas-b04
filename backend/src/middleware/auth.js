import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { HttpError } from '../utils/errores.js';

export function firmarToken(usuarioId) {
  return jwt.sign({ sub: usuarioId }, config.jwtSecret, { expiresIn: config.jwtExpira });
}

export const SQL_USUARIO = `
  SELECT u.id, u.nombre, u.apellido, u.correo, u.activo, r.nombre AS rol,
         p.id AS paciente_id, m.id AS medico_id
  FROM usuarios u
  JOIN roles r ON r.id = u.rol_id
  LEFT JOIN pacientes p ON p.usuario_id = u.id
  LEFT JOIN medicos m ON m.usuario_id = u.id`;

// Verifica el token de sesión y carga al usuario (con su rol) en req.user
export async function autenticar(req, _res, next) {
  const [tipo, token] = (req.headers.authorization || '').split(' ');
  if (tipo !== 'Bearer' || !token) throw new HttpError(401, 'Debes iniciar sesión (token requerido).');

  let carga;
  try {
    carga = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new HttpError(401, 'Sesión inválida o expirada. Inicia sesión nuevamente.');
  }
  const { rows } = await query(`${SQL_USUARIO} WHERE u.id = $1`, [carga.sub]);
  const usuario = rows[0];
  if (!usuario || !usuario.activo) throw new HttpError(401, 'Usuario inexistente o desactivado.');
  req.user = usuario;
  next();
}

// Control de acceso por rol
export const permitirRoles = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user.rol)) {
    throw new HttpError(403, 'No tienes permisos para realizar esta acción.');
  }
  next();
};
