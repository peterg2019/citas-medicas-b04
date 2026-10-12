import 'dotenv/config';

const env = (clave, porDefecto) => process.env[clave] ?? porDefecto;

export const config = {
  entorno: env('NODE_ENV', 'development'),
  puerto: Number(env('PORT', 4000)),
  databaseUrl: env('DATABASE_URL', 'postgres://citas:citas123@localhost:5432/citas_medicas'),
  databaseSsl: env('DATABASE_SSL', 'false') === 'true',
  jwtSecret: env('JWT_SECRET', 'desarrollo-cambiar-en-produccion'),
  jwtExpira: env('JWT_EXPIRES', '8h'),
  // Clave AES-256 (64 caracteres hexadecimales) para cifrar datos clínicos
  claveDatos: env('DATA_ENCRYPTION_KEY', '0'.repeat(63) + '1'),
  corsOrigen: env('CORS_ORIGIN', '*'),
  limiteLogin: Number(env('LOGIN_RATE_LIMIT', 20)),
  agenda: {
    zonaHoraria: 'America/Bogota',
    horaInicio: env('AGENDA_HORA_INICIO', '08:00'),
    horaFin: env('AGENDA_HORA_FIN', '17:00'),
    duracionMin: Number(env('AGENDA_DURACION_MIN', 30)),
  },
  smtp: {
    host: env('SMTP_HOST', ''),
    puerto: Number(env('SMTP_PORT', 587)),
    usuario: env('SMTP_USER', ''),
    clave: env('SMTP_PASS', ''),
    remitente: env('SMTP_FROM', 'Clínica Citas <no-responder@clinica.test>'),
  },
};

if (config.entorno === 'production') {
  const inseguros = [];
  if (config.jwtSecret === 'desarrollo-cambiar-en-produccion') inseguros.push('JWT_SECRET');
  if (config.claveDatos === '0'.repeat(63) + '1') inseguros.push('DATA_ENCRYPTION_KEY');
  if (inseguros.length) {
    throw new Error(`En producción debes definir: ${inseguros.join(', ')}`);
  }
}
if (!/^[0-9a-fA-F]{64}$/.test(config.claveDatos)) {
  throw new Error('DATA_ENCRYPTION_KEY debe tener 64 caracteres hexadecimales (32 bytes).');
}
