import React, { useEffect, useMemo, useState } from 'react';
import { Activity, FilePlus2, Lock } from 'lucide-react';
import { api } from '../api';
import { useFetch } from '../hooks';
import { Alert, Empty, Modal, formatDate, formatDateTime, isPending, statusLabel } from '../ui';

export default function Historia({ token, user, citas, target }) {
  if (user.rol === 'paciente') {
    return (
      <section className="content-card">
        <div className="card-heading">
          <div><h3>Mi historia clínica</h3><p className="muted">Información clínica privada vinculada a tu cuenta.</p></div>
        </div>
        <HistoriaPaciente token={token} pacienteId={user.paciente_id} canWrite={false} />
      </section>
    );
  }
  return <HistoriaMedico token={token} citas={citas} target={target} />;
}

// El médico ve a los pacientes con los que tiene citas y trabaja sobre la historia de cada uno
function HistoriaMedico({ token, citas, target }) {
  const pacientes = useMemo(() => {
    const mapa = new Map();
    citas.filter((c) => c.estado !== 'cancelada').forEach((c) => {
      if (!mapa.has(c.paciente_id)) mapa.set(c.paciente_id, { id: c.paciente_id, nombre: c.paciente, citas: [] });
      mapa.get(c.paciente_id).citas.push(c);
    });
    return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [citas]);

  const [elegido, setElegido] = useState(target?.pacienteId ?? null);
  useEffect(() => { if (target?.pacienteId) setElegido(target.pacienteId); }, [target]);

  const actual = pacientes.find((p) => p.id === elegido) || pacientes[0];

  if (!pacientes.length) {
    return (
      <section className="content-card">
        <Empty icon={Lock} title="Aún no tienes pacientes en tu agenda">
          Podrás consultar y registrar la historia clínica de los pacientes que tengan citas contigo.
        </Empty>
      </section>
    );
  }

  return (
    <div className="split">
      <aside className="content-card patient-list">
        <div className="card-heading"><div><h3>Mis pacientes</h3><p className="muted">Con citas en tu agenda</p></div></div>
        <ul>
          {pacientes.map((p) => (
            <li key={p.id}>
              <button type="button" className={`patient-item ${actual.id === p.id ? 'active' : ''}`} aria-current={actual.id === p.id} onClick={() => setElegido(p.id)}>
                <strong>{p.nombre}</strong>
                <small>{p.citas.length} {p.citas.length === 1 ? 'cita' : 'citas'}</small>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="content-card">
        <HistoriaPaciente
          key={actual.id} token={token} pacienteId={actual.id} canWrite
          citasPaciente={actual.citas} citaSugerida={target?.pacienteId === actual.id ? target.citaId : null}
        />
      </section>
    </div>
  );
}

export function HistoriaPaciente({ token, pacienteId, canWrite, citasPaciente = [], citaSugerida = null }) {
  const { data, loading, error, reload } = useFetch(`/historias/paciente/${pacienteId}`, token);
  const [modal, setModal] = useState(null); // { corrige?: registro }
  const [aviso, setAviso] = useState('');

  const registros = data?.registros || [];
  const corregidos = useMemo(() => new Set(registros.map((r) => r.corrige_registro_id).filter(Boolean)), [registros]);

  if (loading && !data) return <Empty title="Cargando historia clínica…" />;
  if (error) return <div className="pad"><Alert>{error}</Alert></div>;

  return (
    <>
      {canWrite && data && (
        <div className="history-head">
          <div>
            <h3>{data.paciente.nombre}</h3>
            <p className="muted">Documento {data.paciente.documento}{data.paciente.fecha_nacimiento ? ` · Nació el ${formatDate(data.paciente.fecha_nacimiento)}` : ''}</p>
          </div>
          <button className="primary" onClick={() => setModal({})}><FilePlus2 size={16} /> Nuevo registro</button>
        </div>
      )}

      {aviso && <div className="pad"><Alert kind="success" onClose={() => setAviso('')}>{aviso}</Alert></div>}

      {!registros.length ? (
        <Empty icon={Activity} title="No hay registros clínicos">
          {canWrite ? 'Agrega el primer registro de este paciente con el botón “Nuevo registro”.' : 'Cuando un médico registre una atención, aparecerá aquí.'}
        </Empty>
      ) : (
        <div className="history-list">
          {registros.map((r) => (
            <article className="history-entry" key={r.id}>
              <div className="history-meta">
                <span className="history-date">{formatDateTime(r.fecha_registro)}</span>
                {r.corrige_registro_id && <span className="badge reprogramada">Corrige un registro anterior</span>}
                {corregidos.has(r.id) && <span className="badge cancelada">Tiene una corrección posterior</span>}
              </div>
              <h4>{r.diagnostico}</h4>
              <p><strong>Médico:</strong> {r.medico} · {r.especialidad}</p>
              {r.tratamiento && <p><strong>Tratamiento:</strong> {r.tratamiento}</p>}
              {r.notas && <p><strong>Notas:</strong> {r.notas}</p>}
              {canWrite && !corregidos.has(r.id) && (
                <button className="text-button" onClick={() => setModal({ corrige: r })}>Corregir este registro</button>
              )}
            </article>
          ))}
        </div>
      )}

      {modal && (
        <RegistroModal
          token={token} pacienteId={pacienteId} corrige={modal.corrige} citas={citasPaciente} citaSugerida={citaSugerida}
          onClose={() => setModal(null)}
          onDone={(m) => { setModal(null); setAviso(m); reload(); }}
        />
      )}
    </>
  );
}

function RegistroModal({ token, pacienteId, corrige, citas, citaSugerida, onClose, onDone }) {
  const citasVinculables = citas.filter((c) => c.estado !== 'cancelada');
  const [diagnostico, setDiagnostico] = useState(corrige?.diagnostico || '');
  const [tratamiento, setTratamiento] = useState(corrige?.tratamiento || '');
  const [notas, setNotas] = useState(corrige?.notas || '');
  const [citaId, setCitaId] = useState(!corrige && citaSugerida ? String(citaSugerida) : '');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError(''); setGuardando(true);
    try {
      const cuerpo = { diagnostico: diagnostico.trim() };
      if (tratamiento.trim()) cuerpo.tratamiento = tratamiento.trim();
      if (notas.trim()) cuerpo.notas = notas.trim();
      if (citaId) cuerpo.cita_id = Number(citaId);
      if (corrige) cuerpo.corrige_registro_id = corrige.id;
      await api(`/historias/paciente/${pacienteId}/registros`, { token, method: 'POST', body: cuerpo });
      onDone(corrige ? 'Corrección guardada. El registro original se conserva en el historial.' : 'Registro clínico guardado.');
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal title={corrige ? 'Corregir registro clínico' : 'Nuevo registro clínico'} onClose={onClose}>
      <form onSubmit={enviar}>
        <p className="muted">
          {corrige
            ? 'El registro original no se modifica ni se borra: la corrección se agrega como un registro nuevo.'
            : 'Los datos clínicos se guardan cifrados y cada registro queda en el historial de forma permanente.'}
        </p>
        <label>Diagnóstico
          <textarea rows="3" maxLength="4000" value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} required />
        </label>
        <label>Tratamiento <span className="muted">(opcional)</span>
          <textarea rows="3" maxLength="4000" value={tratamiento} onChange={(e) => setTratamiento(e.target.value)} />
        </label>
        <label>Notas <span className="muted">(opcional)</span>
          <textarea rows="2" maxLength="4000" value={notas} onChange={(e) => setNotas(e.target.value)} />
        </label>
        {!corrige && citasVinculables.length > 0 && (
          <label>Cita relacionada <span className="muted">(opcional)</span>
            <select value={citaId} onChange={(e) => setCitaId(e.target.value)}>
              <option value="">Sin cita relacionada</option>
              {citasVinculables.map((c) => (
                <option key={c.id} value={c.id}>{formatDate(c.fecha)} {c.hora} · {statusLabel(c.estado)}</option>
              ))}
            </select>
            {citaId && citasVinculables.find((c) => String(c.id) === citaId && isPending(c)) && (
              <span className="muted">Al guardar, esta cita pasará a “Atendida”.</span>
            )}
          </label>
        )}
        {error && <Alert onClose={() => setError('')}>{error}</Alert>}
        <div className="modal-actions">
          <button type="button" className="outline" onClick={onClose}>Cancelar</button>
          <button className="primary" disabled={guardando || !diagnostico.trim()}>{corrige ? 'Guardar corrección' : 'Guardar registro'}</button>
        </div>
      </form>
    </Modal>
  );
}
