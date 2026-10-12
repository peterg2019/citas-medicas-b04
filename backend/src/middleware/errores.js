import { ZodError } from 'zod';
import { HttpError } from '../utils/errores.js';

export function noEncontrado(_req, res) {
  res.status(404).json({ error: 'Ruta no encontrada.' });
}

export function manejarErrores(error, _req, res, _next) {
  if (error instanceof HttpError) {
    return res.status(error.estado).json({ error: error.message, detalles: error.detalles });
  }
  if (error instanceof ZodError) {
    const detalles = error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message }));
    return res.status(400).json({ error: 'Datos inválidos.', detalles });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido.' });
  }
  if (error.code === '23505') {
    return res.status(409).json({ error: 'Ya existe un registro con esos datos.' });
  }
  console.error(error);
  res.status(500).json({ error: 'Error interno del servidor.' });
}
