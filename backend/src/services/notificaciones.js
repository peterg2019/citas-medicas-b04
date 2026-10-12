import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { query } from '../db/pool.js';

const correoConfigurado = Boolean(config.smtp.host);
const transporte = correoConfigurado
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.puerto,
      secure: config.smtp.puerto === 465,
      auth: config.smtp.usuario ? { user: config.smtp.usuario, pass: config.smtp.clave } : undefined,
    })
  : null;

const TEXTOS = {
  creada: (c) => `quedó programada para el ${c.fecha} a las ${c.hora}`,
  reprogramada: (c) => `fue reprogramada para el ${c.fecha} a las ${c.hora}`,
  cancelada: (c) => `fue cancelada (estaba programada para el ${c.fecha} a las ${c.hora})`,
};

async function cargarCita(citaId) {
  const { rows } = await query(
    `SELECT to_char(c.fecha,'YYYY-MM-DD') AS fecha, to_char(c.hora,'HH24:MI') AS hora,
            up.id AS paciente_usuario, up.nombre AS paciente_nombre, up.correo AS paciente_correo,
            p.telefono AS paciente_telefono,
            um.id AS medico_usuario, um.nombre || ' ' || um.apellido AS medico_nombre,
            um.correo AS medico_correo, e.nombre AS especialidad
     FROM citas c
     JOIN pacientes p ON p.id = c.paciente_id JOIN usuarios up ON up.id = p.usuario_id
     JOIN medicos m ON m.id = c.medico_id JOIN usuarios um ON um.id = m.usuario_id
     JOIN especialidades e ON e.id = m.especialidad_id
     WHERE c.id = $1`,
    [citaId]
  );
  return rows[0];
}

// Envía por correo si hay SMTP configurado; en caso contrario queda como 'simulada'.
// Los SMS siempre se simulan (no hay proveedor de SMS integrado en esta versión).
async function despachar(tipo, destino, asunto, mensaje) {
  if (tipo === 'email' && transporte) {
    await transporte.sendMail({ from: config.smtp.remitente, to: destino, subject: asunto, text: mensaje });
    return 'enviada';
  }
  return 'simulada';
}

async function registrar(citaId, usuarioId, tipo, destino, asunto, mensaje) {
  const { rows } = await query(
    `INSERT INTO notificaciones (cita_id, usuario_id, tipo, mensaje, estado)
     VALUES ($1,$2,$3,$4,'pendiente') RETURNING id`,
    [citaId, usuarioId, tipo, mensaje]
  );
  let estado;
  try {
    estado = await despachar(tipo, destino, asunto, mensaje);
  } catch (error) {
    console.error('Fallo enviando notificación:', error.message);
    estado = 'fallida';
  }
  await query('UPDATE notificaciones SET estado = $1 WHERE id = $2', [estado, rows[0].id]);
}

// evento: 'creada' | 'reprogramada' | 'cancelada'
export async function notificarCita(citaId, evento) {
  try {
    const c = await cargarCita(citaId);
    if (!c) return;
    const accion = TEXTOS[evento](c);
    const asunto = `Cita médica ${evento}`;
    await registrar(citaId, c.paciente_usuario, 'email', c.paciente_correo, asunto,
      `Hola ${c.paciente_nombre}, tu cita de ${c.especialidad} con ${c.medico_nombre} ${accion}.`);
    if (c.paciente_telefono) {
      await registrar(citaId, c.paciente_usuario, 'sms', c.paciente_telefono, asunto,
        `Cita ${evento}: ${c.especialidad}, ${c.fecha} ${c.hora}.`);
    }
    await registrar(citaId, c.medico_usuario, 'email', c.medico_correo, asunto,
      `Dr(a). ${c.medico_nombre}: la cita con ${c.paciente_nombre} ${accion}.`);
  } catch (error) {
    // Una falla de notificación nunca debe impedir la operación principal
    console.error('Error generando notificaciones:', error.message);
  }
}
