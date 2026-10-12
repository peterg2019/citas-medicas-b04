import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../api';
import { Alert, Empty } from '../ui';

export default function Especialidades({ token, especialidades, medicos, notify, onChanged }) {
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function crear(e) {
    e.preventDefault();
    setError(''); setGuardando(true);
    try {
      await api('/especialidades', { token, method: 'POST', body: { nombre: nombre.trim() } });
      notify(`Especialidad “${nombre.trim()}” creada.`);
      setNombre('');
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }
  const medicosDe = (id) => medicos.filter((m) => m.especialidad_id === id).length;

  return (
    <section className="content-card">
      <div className="card-heading">
        <div><h3>Especialidades médicas</h3><p className="muted">Los pacientes las usan para encontrar al médico adecuado.</p></div>
        <span className="count-pill">{especialidades.length} especialidades</span>
      </div>
      <form className="toolbar" onSubmit={crear}>
        <input aria-label="Nombre de la nueva especialidad" placeholder="Nombre de la nueva especialidad" maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        <button className="primary" disabled={guardando || !nombre.trim()}><Plus size={16} /> Agregar especialidad</button>
      </form>
      {error && <div className="pad"><Alert onClose={() => setError('')}>{error}</Alert></div>}
      {especialidades.length ? (
        <ul className="spec-list">
          {especialidades.map((s) => (
            <li key={s.id}><strong>{s.nombre}</strong><span className="muted">{medicosDe(s.id)} {medicosDe(s.id) === 1 ? 'médico' : 'médicos'}</span></li>
          ))}
        </ul>
      ) : <Empty title="Aún no hay especialidades">Agrega la primera para poder registrar médicos.</Empty>}
    </section>
  );
}
