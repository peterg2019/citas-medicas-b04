import { config } from '../config.js';
import { query } from '../db/pool.js';
import { HttpError } from '../utils/errores.js';

const aMinutos = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const aHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// Franjas del día: 08:00, 08:30, ... hasta antes de la hora de cierre
export function generarFranjas() {
  const { horaInicio, horaFin, duracionMin } = config.agenda;
  const franjas = [];
  for (let m = aMinutos(horaInicio); m + duracionMin <= aMinutos(horaFin); m += duracionMin) {
    franjas.push(aHHMM(m));
  }
  return franjas;
}

// Fecha y hora actuales en la zona horaria de Colombia
export function ahora() {
  const [fecha, hora] = new Date()
    .toLocaleString('sv-SE', { timeZone: config.agenda.zonaHoraria })
    .split(' ');
  return { fecha, hora: hora.slice(0, 5) };
}

export function esFechaValida(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const d = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}

export function esDiaHabil(fecha) {
  const dia = new Date(`${fecha}T00:00:00Z`).getUTCDay(); // 0 domingo ... 6 sábado
  return dia >= 1 && dia <= 5;
}

// Valida que fecha/hora correspondan a una franja de agenda futura y laboral
export function validarFranja(fecha, hora) {
  if (!esFechaValida(fecha)) throw new HttpError(400, 'La fecha debe tener formato AAAA-MM-DD.');
  if (!generarFranjas().includes(hora)) {
    throw new HttpError(400, `La hora no corresponde a una franja válida (${generarFranjas()[0]} a ${config.agenda.horaFin}, cada ${config.agenda.duracionMin} min).`);
  }
  if (!esDiaHabil(fecha)) throw new HttpError(400, 'Solo se agendan citas de lunes a viernes.');
  const actual = ahora();
  if (fecha < actual.fecha || (fecha === actual.fecha && hora <= actual.hora)) {
    throw new HttpError(400, 'No se pueden agendar citas en fechas u horas pasadas.');
  }
}

export async function franjasDisponibles(medicoId, fecha) {
  if (!esFechaValida(fecha)) throw new HttpError(400, 'La fecha debe tener formato AAAA-MM-DD.');
  if (!esDiaHabil(fecha)) return [];
  const { rows } = await query(
    `SELECT to_char(hora,'HH24:MI') AS hora FROM citas
     WHERE medico_id = $1 AND fecha = $2 AND estado <> 'cancelada'`,
    [medicoId, fecha]
  );
  const ocupadas = new Set(rows.map((r) => r.hora));
  const actual = ahora();
  return generarFranjas().filter(
    (h) => !ocupadas.has(h) && (fecha > actual.fecha || (fecha === actual.fecha && h > actual.hora))
  );
}
