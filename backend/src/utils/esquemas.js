import { z } from 'zod';

export const texto = (campo, max = 80) =>
  z.string({ error: `${campo} es obligatorio.` }).trim().min(1, `${campo} es obligatorio.`).max(max, `${campo} es demasiado largo.`);

export const correo = z.email('Correo electrónico inválido.').max(150).transform((v) => v.toLowerCase());

export const clave = z
  .string({ error: 'La contraseña es obligatoria.' })
  .min(8, 'La contraseña debe tener al menos 8 caracteres.')
  .max(72, 'La contraseña es demasiado larga.')
  .regex(/[A-Za-z]/, 'La contraseña debe incluir al menos una letra.')
  .regex(/\d/, 'La contraseña debe incluir al menos un número.');

export const idEntero = z.coerce.number().int().positive();

export const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato AAAA-MM-DD.');
export const hora = z.string().regex(/^\d{2}:\d{2}$/, 'La hora debe tener formato HH:MM.');

export const datosPaciente = {
  documento: texto('El documento', 20),
  telefono: z.string().trim().max(20).optional(),
  direccion: z.string().trim().max(200).optional(),
  fecha_nacimiento: fecha.optional(),
};
