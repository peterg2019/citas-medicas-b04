import React, { useState } from 'react';
import { HeartPulse, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import { Alert } from '../ui';

const DEMO = [
  ['Paciente', 'paciente1@clinica.test'],
  ['Médico', 'medico1@clinica.test'],
  ['Administrador', 'admin@clinica.test'],
];
const FORM_VACIO = { nombre: '', apellido: '', correo: '', documento: '', telefono: '', fecha_nacimiento: '', password: '' };

export default function Login({ onLogin, aviso }) {
  const [modo, setModo] = useState('login'); // 'login' | 'registro'
  const [form, setForm] = useState(FORM_VACIO);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const cambiar = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  function cambiarModo(nuevo) {
    setModo(nuevo); setError(''); setForm(FORM_VACIO);
  }

  async function enviar(e) {
    e.preventDefault();
    setCargando(true); setError('');
    try {
      if (modo === 'login') {
        onLogin(await api('/auth/login', { method: 'POST', body: { correo: form.correo.trim(), password: form.password } }));
      } else {
        const cuerpo = {
          nombre: form.nombre.trim(), apellido: form.apellido.trim(), correo: form.correo.trim(),
          documento: form.documento.trim(), password: form.password,
        };
        if (form.telefono.trim()) cuerpo.telefono = form.telefono.trim();
        if (form.fecha_nacimiento) cuerpo.fecha_nacimiento = form.fecha_nacimiento;
        onLogin(await api('/auth/registro', { method: 'POST', body: cuerpo }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  const esLogin = modo === 'login';

  return (
    <main className="login-layout">
      <section className="login-brand">
        <div className="brand-mark"><HeartPulse size={30} /></div>
        <p className="eyebrow">SALUD · CONFIANZA · BIENESTAR</p>
        <h1>Tu salud merece<br /><span>una atención simple.</span></h1>
        <p className="brand-copy">Gestiona tus citas médicas desde un solo lugar, con información organizada y segura.</p>
        <div className="brand-bottom"><ShieldCheck size={18} /> Acceso protegido con autenticación segura</div>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={enviar}>
          <div className="mobile-logo"><HeartPulse /> Clínica</div>
          <h2>{esLogin ? 'Iniciar sesión' : 'Crear cuenta de paciente'}</h2>
          <p className="muted">
            {esLogin ? 'Ingresa tus credenciales para continuar.' : 'Regístrate para agendar citas y consultar tu historia clínica.'}
          </p>

          {aviso && !error && <Alert kind="success">{aviso}</Alert>}
          {error && <Alert>{error}</Alert>}

          {!esLogin && (
            <div className="form-row">
              <label>Nombre<input value={form.nombre} onChange={cambiar('nombre')} autoComplete="given-name" required /></label>
              <label>Apellido<input value={form.apellido} onChange={cambiar('apellido')} autoComplete="family-name" required /></label>
            </div>
          )}

          <label>Correo electrónico
            <input type="email" autoComplete="username" value={form.correo} onChange={cambiar('correo')} placeholder="nombre@correo.com" required />
          </label>

          {!esLogin && (
            <>
              <div className="form-row">
                <label>Documento<input value={form.documento} onChange={cambiar('documento')} inputMode="numeric" required /></label>
                <label>Teléfono <span className="muted">(opcional)</span><input value={form.telefono} onChange={cambiar('telefono')} inputMode="tel" autoComplete="tel" /></label>
              </div>
              <label>Fecha de nacimiento <span className="muted">(opcional)</span>
                <input type="date" value={form.fecha_nacimiento} onChange={cambiar('fecha_nacimiento')} />
              </label>
            </>
          )}

          <label>Contraseña
            <input type="password" autoComplete={esLogin ? 'current-password' : 'new-password'} value={form.password}
              onChange={cambiar('password')} placeholder={esLogin ? 'Tu contraseña' : 'Mínimo 8 caracteres, con letras y números'} required />
          </label>

          <button className="primary full" disabled={cargando}>
            {cargando ? (esLogin ? 'Ingresando…' : 'Creando cuenta…') : (esLogin ? 'Ingresar a mi cuenta' : 'Crear mi cuenta')}
          </button>

          <p className="switch-mode">
            {esLogin ? '¿Aún no tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
            <button type="button" className="text-button" onClick={() => cambiarModo(esLogin ? 'registro' : 'login')}>
              {esLogin ? 'Regístrate como paciente' : 'Inicia sesión'}
            </button>
          </p>

          {esLogin && (
            <div className="demo-box">
              <strong>Modo de demostración</strong>
              {DEMO.map(([rol, correo]) => (
                <span key={correo} className="demo-row">
                  {rol}: {correo}
                  <button type="button" className="text-button" onClick={() => setForm({ ...form, correo, password: 'Demo2026*' })}>Usar</button>
                </span>
              ))}
              <small>Contraseña de ejemplo: Demo2026*</small>
            </div>
          )}
          <p className="security-note"><ShieldCheck size={15} /> Los permisos dependen del rol asignado en el servidor.</p>
        </form>
      </section>
    </main>
  );
}
