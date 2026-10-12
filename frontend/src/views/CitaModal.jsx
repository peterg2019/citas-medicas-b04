import React, { useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { api } from '../api';
import { useFetch } from '../hooks';
import { Alert, Modal, formatDate, isWeekend, today } from '../ui';

// Agendar una cita nueva o reprogramar una existente, mostrando solo las horas realmente libres
export default function CitaModal({ token, user, mode, cita, medicos, especialidades, onClose, onDone }) {
  const reprogramar = mode === 'reprogramar';
  const esAdmin = user.rol === 'administrador';

  const [especialidadId, setEspecialidadId] = useState('');
  const [medicoId, setMedicoId] = useState(reprogramar ? String(cita.medico_id) : '');
  const [pacienteId, setPacienteId] = useState('');
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const medicosFiltrados = useMemo(
    () => medicos.filter((m) => !especialidadId || String(m.especialidad_id) === especialidadId),
    [medicos, especialidadId]
  );

  const pacientes = useFetch('/usuarios?rol=paciente', token, { enabled: esAdmin && !reprogramar });
  const listaPacientes = (pacientes.data?.usuarios || []).filter((u) => u.activo);

  const consultar = Boolean(medicoId && fecha);
  const disponibilidad = useFetch(consultar ? `/medicos/${medicoId}/disponibilidad?fecha=${fecha}` : null, token, { enabled: consultar });
  const horas = consultar ? disponibilidad.data?.disponibles || [] : [];

  const listo = medicoId && fecha && hora && (!esAdmin || reprogramar || pacienteId);

  async function enviar(e) {
    e.preventDefault();
    setError(''); setGuardando(true);
    try {
      if (reprogramar) {
        await api(`/citas/${cita.id}/reprogramar`, { token, method: 'PATCH', body: { fecha, hora } });
        onDone('Cita reprogramada. Se registró la notificación para el paciente y el médico.');
      } else {
        const cuerpo = { medico_id: Number(medicoId), fecha, hora };
        if (motivo.trim()) cuerpo.motivo = motivo.trim();
        if (esAdmin) cuerpo.paciente_id = Number(pacienteId);
        await api('/citas', { token, method: 'POST', body: cuerpo });
        onDone('La cita se agendó correctamente. Se registró la notificación de confirmación.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  let ayuda = null;
  if (!consultar) ayuda = 'Elige médico y fecha para ver los horarios libres.';
  else if (disponibilidad.loading) ayuda = 'Consultando horarios…';
  else if (disponibilidad.error) ayuda = null;
  else if (isWeekend(fecha)) ayuda = 'La clínica atiende de lunes a viernes. Elige otra fecha.';
  else if (!horas.length) ayuda = 'No quedan horarios libres ese día. Prueba con otra fecha u otro médico.';

  return (
    <Modal title={reprogramar ? 'Reprogramar cita' : 'Agendar cita médica'} onClose={onClose}>
      <form onSubmit={enviar}>
        <p className="muted">
          {reprogramar
            ? `Cita actual: ${formatDate(cita.fecha)} a las ${cita.hora} con ${cita.medico}. Elige la nueva fecha y hora.`
            : 'Selecciona médico y fecha; solo verás las horas que están libres.'}
        </p>

        {!reprogramar && esAdmin && (
          <label>Paciente
            <select value={pacienteId} onChange={(e) => setPacienteId(e.target.value)} required>
              <option value="">Selecciona un paciente</option>
              {listaPacientes.map((p) => <option key={p.id} value={p.paciente_id}>{p.nombre} {p.apellido} · {p.correo}</option>)}
            </select>
          </label>
        )}

        {!reprogramar && (
          <div className="form-row">
            <label>Especialidad
              <select value={especialidadId} onChange={(e) => { setEspecialidadId(e.target.value); setMedicoId(''); setHora(''); }}>
                <option value="">Todas</option>
                {especialidades.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </label>
            <label>Médico
              <select value={medicoId} onChange={(e) => { setMedicoId(e.target.value); setHora(''); }} required>
                <option value="">Selecciona un médico</option>
                {medicosFiltrados.map((m) => <option key={m.id} value={m.id}>Dr./Dra. {m.nombre} {m.apellido}{especialidadId ? '' : ` · ${m.especialidad}`}</option>)}
              </select>
            </label>
          </div>
        )}

        <label>Fecha
          <input type="date" min={today()} value={fecha} onChange={(e) => { setFecha(e.target.value); setHora(''); }} required />
        </label>

        <div className="slots-block">
          <span className="slots-title" id="titulo-horas">Horas disponibles</span>
          {horas.length > 0 && (
            <div className="slots" role="group" aria-labelledby="titulo-horas">
              {horas.map((h) => (
                <button type="button" key={h} className={`slot ${hora === h ? 'selected' : ''}`} aria-pressed={hora === h} onClick={() => setHora(h)}>{h}</button>
              ))}
            </div>
          )}
          {ayuda && <p className="slot-hint">{ayuda}</p>}
          {disponibilidad.error && <Alert>{disponibilidad.error}</Alert>}
        </div>

        {!reprogramar && (
          <label>Motivo de consulta <span className="muted">(opcional)</span>
            <textarea rows="3" maxLength="250" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Describe brevemente el motivo de la cita" />
          </label>
        )}

        {error && <Alert onClose={() => setError('')}>{error}</Alert>}

        <div className="modal-actions">
          <button type="button" className="outline" onClick={onClose}>Cancelar</button>
          <button className="primary" disabled={!listo || guardando}>
            <CalendarDays size={16} /> {reprogramar ? 'Guardar nueva fecha' : 'Confirmar cita'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
