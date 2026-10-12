import React, { useMemo, useState } from 'react';
import { CalendarDays, Clock3, Plus, Stethoscope, Users } from 'lucide-react';
import { api } from '../api';
import { Alert, Empty, Stat, formatDate, isPending, statusLabel } from '../ui';
import CitaModal from './CitaModal';

const FILTROS = [['todas', 'Todas'], ['proximas', 'Próximas'], ['atendida', 'Atendidas'], ['cancelada', 'Canceladas']];
const coincide = (filtro, c) => (filtro === 'todas' ? true : filtro === 'proximas' ? isPending(c) : c.estado === filtro);

export default function Citas({ token, user, data, onRefresh, notify, onHistoria }) {
  const { citas, medicos, especialidades, loading } = data;
  const rol = user.rol;
  const [filtro, setFiltro] = useState('todas');
  const [modal, setModal] = useState(null); // { mode: 'agendar' } | { mode: 'reprogramar', cita }
  const [error, setError] = useState('');

  const visibles = useMemo(() => citas.filter((c) => coincide(filtro, c)), [citas, filtro]);
  const pendientes = citas.filter(isPending).length;
  const tercera = rol === 'medico'
    ? { icon: Users, label: 'Pacientes en agenda', value: new Set(citas.filter((c) => c.estado !== 'cancelada').map((c) => c.paciente_id)).size }
    : rol === 'paciente'
      ? { icon: Stethoscope, label: 'Citas atendidas', value: citas.filter((c) => c.estado === 'atendida').length }
      : { icon: Stethoscope, label: 'Médicos activos', value: medicos.length };

  async function cambiar(cita, accion, mensaje) {
    setError('');
    try {
      await api(`/citas/${cita.id}/${accion}`, { token, method: 'PATCH' });
      notify(mensaje);
      await onRefresh();
    } catch (err) { setError(err.message); }
  }
  const cancelar = (c) => {
    if (window.confirm('¿Seguro que deseas cancelar esta cita?')) cambiar(c, 'cancelar', 'Cita cancelada. Se registró la notificación correspondiente.');
  };

  const columnaPersona = rol === 'medico' ? 'Paciente' : rol === 'paciente' ? 'Médico' : 'Paciente y médico';

  return (
    <>
      <section className="welcome-row">
        <div>
          <h2>Hola, {user.nombre}.</h2>
          <p className="muted">{rol === 'medico' ? 'Esta es tu agenda de atención.' : 'Aquí puedes consultar y gestionar tus citas.'}</p>
        </div>
        {rol !== 'medico' && <button className="primary" onClick={() => setModal({ mode: 'agendar' })}><Plus size={17} /> Agendar cita</button>}
      </section>

      <section className="stats-grid">
        <Stat icon={CalendarDays} label="Total de citas" value={citas.length} tone="teal" />
        <Stat icon={Clock3} label="Pendientes" value={pendientes} tone="blue" />
        <Stat icon={tercera.icon} label={tercera.label} value={tercera.value} tone="violet" />
      </section>

      {error && <Alert onClose={() => setError('')}>{error}</Alert>}

      <section className="content-card">
        <div className="card-heading">
          <div>
            <h3>{rol === 'medico' ? 'Agenda de atención' : rol === 'paciente' ? 'Tus citas médicas' : 'Todas las citas'}</h3>
            <p className="muted">Se actualiza al instante cuando agendas, reprogramas o cancelas.</p>
          </div>
          <span className="count-pill">{visibles.length} {visibles.length === 1 ? 'cita' : 'citas'}</span>
        </div>
        <div className="toolbar">
          <div className="pills" role="group" aria-label="Filtrar por estado">
            {FILTROS.map(([id, nombre]) => (
              <button key={id} type="button" className="pill" aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{nombre}</button>
            ))}
          </div>
        </div>

        {loading && !citas.length ? (
          <Empty title="Cargando información…" />
        ) : visibles.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Fecha y hora</th><th>{columnaPersona}</th><th>Especialidad</th><th>Motivo</th><th>Estado</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {visibles.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{formatDate(c.fecha)}</strong><small className="cell-sub">{c.hora}</small></td>
                    <td>
                      {rol === 'medico' && c.paciente}
                      {rol === 'paciente' && c.medico}
                      {rol === 'administrador' && <><strong>{c.paciente}</strong><small className="cell-sub">con {c.medico}</small></>}
                    </td>
                    <td>{c.especialidad}</td>
                    <td>{c.motivo || '—'}</td>
                    <td><span className={`badge ${c.estado}`}>{statusLabel(c.estado)}</span></td>
                    <td>
                      <div className="row-actions">
                        {isPending(c) && rol !== 'medico' && (
                          <button className="text-button" onClick={() => setModal({ mode: 'reprogramar', cita: c })}>Reprogramar</button>
                        )}
                        {isPending(c) && rol === 'medico' && (
                          <button className="text-button" onClick={() => cambiar(c, 'atender', 'Cita marcada como atendida.')}>Marcar atendida</button>
                        )}
                        {rol === 'medico' && c.estado !== 'cancelada' && (
                          <button className="text-button" onClick={() => onHistoria(c)}>Historia clínica</button>
                        )}
                        {isPending(c) && <button className="text-button danger-text" onClick={() => cancelar(c)}>Cancelar</button>}
                        {!isPending(c) && !(rol === 'medico' && c.estado === 'atendida') && <span className="muted">—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={CalendarDays} title={citas.length ? 'No hay citas con este filtro' : 'Aún no hay citas registradas'}>
            {citas.length ? 'Prueba con otro filtro.' : 'Cuando haya citas, aparecerán en este espacio.'}
          </Empty>
        )}
      </section>

      {modal && (
        <CitaModal
          token={token} user={user} mode={modal.mode} cita={modal.cita} medicos={medicos} especialidades={especialidades}
          onClose={() => setModal(null)}
          onDone={async (mensaje) => { setModal(null); notify(mensaje); await onRefresh(); }}
        />
      )}
    </>
  );
}
