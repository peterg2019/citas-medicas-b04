import React, { useMemo, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { api } from '../api';
import { useFetch } from '../hooks';
import { Alert, Empty, Modal, ROLE_LABEL } from '../ui';

export default function Usuarios({ token, user, especialidades, notify, onChanged }) {
  const { data, loading, error, reload } = useFetch('/usuarios', token);
  const [busqueda, setBusqueda] = useState('');
  const [rol, setRol] = useState('');
  const [modal, setModal] = useState(false);
  const [errorAccion, setErrorAccion] = useState('');

  const usuarios = data?.usuarios || [];
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return usuarios.filter((u) =>
      (!rol || u.rol === rol) && (!q || `${u.nombre} ${u.apellido} ${u.correo}`.toLowerCase().includes(q)));
  }, [usuarios, busqueda, rol]);

  async function alternarActivo(u) {
    setErrorAccion('');
    try {
      await api(`/usuarios/${u.id}`, { token, method: 'PATCH', body: { activo: !u.activo } });
      notify(u.activo ? `Se desactivó la cuenta de ${u.nombre} ${u.apellido}.` : `Se activó la cuenta de ${u.nombre} ${u.apellido}.`);
      reload(); onChanged();
    } catch (err) { setErrorAccion(err.message); }
  }

  return (
    <>
      {errorAccion && <Alert onClose={() => setErrorAccion('')}>{errorAccion}</Alert>}
      <section className="content-card">
        <div className="card-heading">
          <div><h3>Usuarios registrados</h3><p className="muted">Crea cuentas, asigna roles y activa o desactiva el acceso.</p></div>
          <div className="heading-actions">
            <span className="count-pill">{visibles.length} {visibles.length === 1 ? 'usuario' : 'usuarios'}</span>
            <button className="primary" onClick={() => setModal(true)}><UserPlus size={16} /> Nuevo usuario</button>
          </div>
        </div>
        <div className="toolbar">
          <input type="search" aria-label="Buscar usuario" placeholder="Buscar por nombre o correo" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          <select aria-label="Filtrar por rol" value={rol} onChange={(e) => setRol(e.target.value)}>
            <option value="">Todos los roles</option>
            {Object.entries(ROLE_LABEL).map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </select>
        </div>
        {error && <div className="pad"><Alert>{error}</Alert></div>}
        {loading && !data ? <Empty title="Cargando usuarios…" /> : visibles.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Especialidad</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody>
                {visibles.map((u) => (
                  <tr key={u.id}>
                    <td><strong>{u.nombre} {u.apellido}</strong></td>
                    <td>{u.correo}</td>
                    <td>{ROLE_LABEL[u.rol] || u.rol}</td>
                    <td>{u.especialidad || '—'}</td>
                    <td><span className={`badge ${u.activo ? 'programada' : 'cancelada'}`}>{u.activo ? 'Activo' : 'Inactivo'}</span></td>
                    <td>
                      {u.id === user.id
                        ? <span className="muted">Tu cuenta</span>
                        : <button className={`text-button ${u.activo ? 'danger-text' : ''}`} onClick={() => alternarActivo(u)}>{u.activo ? 'Desactivar' : 'Activar'}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="No hay usuarios con ese criterio">Prueba con otra búsqueda o rol.</Empty>}
      </section>

      {modal && (
        <NuevoUsuario
          token={token} especialidades={especialidades} onClose={() => setModal(false)}
          onDone={(m) => { setModal(false); notify(m); reload(); onChanged(); }}
        />
      )}
    </>
  );
}

function NuevoUsuario({ token, especialidades, onClose, onDone }) {
  const [form, setForm] = useState({
    rol: 'medico', nombre: '', apellido: '', correo: '', password: '',
    especialidad_id: '', registro_medico: '', documento: '', telefono: '',
  });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const campo = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function enviar(e) {
    e.preventDefault();
    setError(''); setGuardando(true);
    try {
      const cuerpo = { rol: form.rol, nombre: form.nombre.trim(), apellido: form.apellido.trim(), correo: form.correo.trim(), password: form.password };
      if (form.rol === 'medico') {
        cuerpo.especialidad_id = Number(form.especialidad_id);
        if (form.registro_medico.trim()) cuerpo.registro_medico = form.registro_medico.trim();
      }
      if (form.rol === 'paciente') {
        cuerpo.documento = form.documento.trim();
        if (form.telefono.trim()) cuerpo.telefono = form.telefono.trim();
      }
      await api('/usuarios', { token, method: 'POST', body: cuerpo });
      onDone(`Cuenta creada: ${form.nombre.trim()} ${form.apellido.trim()} (${ROLE_LABEL[form.rol]}).`);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal title="Nuevo usuario" onClose={onClose}>
      <form onSubmit={enviar}>
        <label>Rol
          <select value={form.rol} onChange={campo('rol')}>
            {Object.entries(ROLE_LABEL).map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </select>
        </label>
        <div className="form-row">
          <label>Nombre<input value={form.nombre} onChange={campo('nombre')} required /></label>
          <label>Apellido<input value={form.apellido} onChange={campo('apellido')} required /></label>
        </div>
        <label>Correo electrónico<input type="email" value={form.correo} onChange={campo('correo')} required /></label>
        <label>Contraseña inicial
          <input type="password" autoComplete="new-password" value={form.password} onChange={campo('password')} placeholder="Mínimo 8 caracteres, con letras y números" required />
        </label>
        {form.rol === 'medico' && (
          <div className="form-row">
            <label>Especialidad
              <select value={form.especialidad_id} onChange={campo('especialidad_id')} required>
                <option value="">Selecciona</option>
                {especialidades.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </label>
            <label>Registro médico <span className="muted">(opcional)</span><input value={form.registro_medico} onChange={campo('registro_medico')} /></label>
          </div>
        )}
        {form.rol === 'paciente' && (
          <div className="form-row">
            <label>Documento<input value={form.documento} onChange={campo('documento')} required /></label>
            <label>Teléfono <span className="muted">(opcional)</span><input value={form.telefono} onChange={campo('telefono')} /></label>
          </div>
        )}
        {error && <Alert onClose={() => setError('')}>{error}</Alert>}
        <div className="modal-actions">
          <button type="button" className="outline" onClick={onClose}>Cancelar</button>
          <button className="primary" disabled={guardando}>Crear cuenta</button>
        </div>
      </form>
    </Modal>
  );
}
