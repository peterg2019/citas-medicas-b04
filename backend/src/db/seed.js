import bcrypt from 'bcryptjs';
import { pool } from './pool.js';
import { cifrar } from '../utils/cifrado.js';
import { ahora, esDiaHabil } from '../services/agenda.js';

const CLAVE_DEMO = 'Demo2026*';

// Devuelve la fecha 'AAAA-MM-DD' desplazada n días (usa UTC para evitar desfases)
const sumarDias = (fecha, n) => {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// Siguiente día hábil, contando desde mañana, saltando 'saltos' días hábiles
const diaHabil = (desde, saltos) => {
  let f = desde;
  let n = 0;
  while (true) {
    f = sumarDias(f, 1);
    if (esDiaHabil(f)) { if (n === saltos) return f; n++; }
  }
};
const diaHabilPasado = (desde, saltos) => {
  let f = desde;
  let n = 0;
  while (true) {
    f = sumarDias(f, -1);
    if (esDiaHabil(f)) { if (n === saltos) return f; n++; }
  }
};

const cliente = await pool.connect();
try {
  const existentes = await cliente.query('SELECT count(*)::int AS n FROM usuarios');
  if (existentes.rows[0].n > 0) {
    console.log('La base ya tiene usuarios. Para recargar los datos de ejemplo ejecuta: npm run db:reset && npm run db:seed');
  } else {
    await cliente.query('BEGIN');
    const hash = await bcrypt.hash(CLAVE_DEMO, 10);
    const hoy = ahora().fecha;

    const esp = {};
    for (const n of ['Medicina General', 'Pediatría', 'Cardiología', 'Dermatología', 'Ginecología', 'Odontología']) {
      const r = await cliente.query('INSERT INTO especialidades (nombre) VALUES ($1) RETURNING id', [n]);
      esp[n] = r.rows[0].id;
    }

    const crearUsuario = async (nombre, apellido, correo, rol) => {
      const r = await cliente.query(
        `INSERT INTO usuarios (nombre, apellido, correo, password_hash, rol_id)
         VALUES ($1,$2,$3,$4,(SELECT id FROM roles WHERE nombre = $5)) RETURNING id`,
        [nombre, apellido, correo, hash, rol]);
      return r.rows[0].id;
    };

    await crearUsuario('Administrador', 'Sistema', 'admin@clinica.test', 'administrador');

    const medicos = {};
    for (const [nombre, apellido, correo, especialidad, reg] of [
      ['Laura', 'Gómez', 'medico1@clinica.test', 'Medicina General', 'RM-1001'],
      ['Andrés', 'Ruiz', 'medico2@clinica.test', 'Pediatría', 'RM-1002'],
      ['Marta', 'Peña', 'medico3@clinica.test', 'Cardiología', 'RM-1003'],
      ['Carlos', 'Díaz', 'medico4@clinica.test', 'Dermatología', 'RM-1004'],
    ]) {
      const uid = await crearUsuario(nombre, apellido, correo, 'medico');
      const m = await cliente.query(
        'INSERT INTO medicos (usuario_id, especialidad_id, registro_medico) VALUES ($1,$2,$3) RETURNING id',
        [uid, esp[especialidad], reg]);
      medicos[correo] = m.rows[0].id;
    }

    const pacientes = {};
    const historias = {};
    for (const [nombre, apellido, correo, doc, tel, nac] of [
      ['Juan', 'Pérez', 'paciente1@clinica.test', '1010101010', '3001112233', '1990-05-14'],
      ['Ana', 'Torres', 'paciente2@clinica.test', '1020202020', '3004445566', '1985-11-02'],
      ['Luis', 'Mora', 'paciente3@clinica.test', '1030303030', '3007778899', '2001-03-27'],
    ]) {
      const uid = await crearUsuario(nombre, apellido, correo, 'paciente');
      const p = await cliente.query(
        `INSERT INTO pacientes (usuario_id, documento, telefono, direccion, fecha_nacimiento)
         VALUES ($1,$2,$3,'Bogotá, Colombia',$4) RETURNING id`, [uid, doc, tel, nac]);
      const h = await cliente.query('INSERT INTO historias_clinicas (paciente_id) VALUES ($1) RETURNING id', [p.rows[0].id]);
      pacientes[correo] = p.rows[0].id;
      historias[correo] = h.rows[0].id;
    }

    const cita = async (pac, med, fecha, hora, estado, motivo) => {
      const r = await cliente.query(
        `INSERT INTO citas (paciente_id, medico_id, fecha, hora, estado, motivo)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [pacientes[pac], medicos[med], fecha, hora, estado, motivo]);
      return r.rows[0].id;
    };

    // Citas pasadas (atendidas) con historia clínica de ejemplo
    const c1 = await cita('paciente1@clinica.test', 'medico1@clinica.test', diaHabilPasado(hoy, 6), '09:00', 'atendida', 'Control general');
    const c2 = await cita('paciente1@clinica.test', 'medico3@clinica.test', diaHabilPasado(hoy, 2), '10:30', 'atendida', 'Dolor en el pecho');
    const c3 = await cita('paciente2@clinica.test', 'medico2@clinica.test', diaHabilPasado(hoy, 3), '14:00', 'atendida', 'Control de crecimiento');
    // La fecha del registro coincide con la de la cita en la que se atendió
    const registro = (h, m, c, dx, tx, nota) => cliente.query(
      `INSERT INTO registros_clinicos (historia_id, medico_id, cita_id, diagnostico, tratamiento, notas, fecha_registro)
       VALUES ($1,$2,$3,$4,$5,$6,(SELECT (fecha + hora)::timestamp AT TIME ZONE 'America/Bogota' FROM citas WHERE id = $3))`,
      [h, m, c, cifrar(dx), cifrar(tx), cifrar(nota)]);
    await registro(historias['paciente1@clinica.test'], medicos['medico1@clinica.test'], c1,
      'Hipertensión arterial leve', 'Reducir sodio en la dieta y caminar 30 minutos diarios', 'Control en 3 meses');
    await registro(historias['paciente1@clinica.test'], medicos['medico3@clinica.test'], c2,
      'Ansiedad con palpitaciones, electrocardiograma normal', 'Pausas activas y control de cafeína', 'Sin hallazgos cardíacos');
    await registro(historias['paciente2@clinica.test'], medicos['medico2@clinica.test'], c3,
      'Desarrollo adecuado para la edad', 'Esquema de vacunación al día', 'Próximo control en 6 meses');

    // Citas próximas
    await cita('paciente1@clinica.test', 'medico1@clinica.test', diaHabil(hoy, 1), '09:00', 'programada', 'Revisión de presión arterial');
    await cita('paciente2@clinica.test', 'medico1@clinica.test', diaHabil(hoy, 1), '09:30', 'programada', 'Chequeo anual');
    await cita('paciente3@clinica.test', 'medico4@clinica.test', diaHabil(hoy, 2), '11:00', 'programada', 'Consulta por dermatitis');
    await cita('paciente2@clinica.test', 'medico3@clinica.test', diaHabil(hoy, 3), '15:00', 'programada', 'Evaluación cardiológica');

    await cliente.query('COMMIT');
    console.log('Datos de ejemplo cargados.');
    console.log(`Todos los usuarios usan la contraseña: ${CLAVE_DEMO}`);
    console.log('  Administrador: admin@clinica.test');
    console.log('  Médicos:       medico1@clinica.test ... medico4@clinica.test');
    console.log('  Pacientes:     paciente1@clinica.test ... paciente3@clinica.test');
  }
} catch (error) {
  await cliente.query('ROLLBACK');
  console.error('Error cargando datos de ejemplo:', error.message);
  process.exitCode = 1;
} finally {
  cliente.release();
  await pool.end();
}
