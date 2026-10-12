import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Bell, CalendarDays, HeartPulse, LogOut, RefreshCw, Stethoscope, Users, BarChart3 } from 'lucide-react';
import { api, registrarManejoSesion } from './api';
import { Alert, ROLE_LABEL } from './ui';
import Login from './views/Login';
import Citas from './views/Citas';
import Historia from './views/Historia';
import Notificaciones from './views/Notificaciones';
import Usuarios from './views/Usuarios';
import Especialidades from './views/Especialidades';
import Reportes from './views/Reportes';

const CLAVE_SESION = 'citas-session';
const DATOS_VACIOS = { citas: [], medicos: [], especialidades: [], loading: false, error: '', online: true };

function leerSesion() {
  try { return JSON.parse(sessionStorage.getItem(CLAVE_SESION) || 'null'); } catch { return null; }
}

export default function App() {
  const [sesion, setSesion] = useState(leerSesion);
  const [vista, setVista] = useState('citas');
  const [aviso, setAviso] = useState('');
  const [avisoLogin, setAvisoLogin] = useState('');
  const [datos, setDatos] = useState(DATOS_VACIOS);
  const [destinoHistoria, setDestinoHistoria] = useState(null);

  const token = sesion?.token;
  const user = sesion?.usuario;
  const rol = user?.rol;

  const cerrarSesion = useCallback((mensaje = '') => {
    sessionStorage.removeItem(CLAVE_SESION);
    setSesion(null); setVista('citas'); setAviso(''); setDatos(DATOS_VACIOS); setDestinoHistoria(null);
    setAvisoLogin(mensaje);
  }, []);

  useEffect(() => {
    registrarManejoSesion(() => cerrarSesion('Tu sesión expiró o fue cerrada. Inicia sesión de nuevo.'));
    return () => registrarManejoSesion(null);
  }, [cerrarSesion]);

  function iniciarSesion(resultado) {
    const siguiente = { token: resultado.token, usuario: resultado.usuario };
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify(siguiente));
    setAvisoLogin(''); setSesion(siguiente);
  }

  const refrescar = useCallback(async () => {
    if (!token) return;
    setDatos((d) => ({ ...d, loading: true, error: '' }));
    try {
      const [c, m, e] = await Promise.all([api('/citas', { token }), api('/medicos', { token }), api('/especialidades', { token })]);
      setDatos({ citas: c.citas || [], medicos: m.medicos || [], especialidades: e.especialidades || [], loading: false, error: '', online: true });
    } catch (err) {
      setDatos((d) => ({ ...d, loading: false, error: err.message, online: err.status !== undefined }));
    }
  }, [token]);

  useEffect(() => { if (token) refrescar(); }, [token, refrescar]);

  const menu = useMemo(() => {
    if (rol === 'paciente') return [
      { id: 'citas', label: 'Citas médicas', icon: CalendarDays },
      { id: 'historia', label: 'Historia clínica', icon: Activity },
      { id: 'notificaciones', label: 'Notificaciones', icon: Bell },
    ];
    if (rol === 'medico') return [
      { id: 'citas', label: 'Mi agenda', icon: CalendarDays },
      { id: 'historia', label: 'Historias clínicas', icon: Activity },
      { id: 'notificaciones', label: 'Notificaciones', icon: Bell },
    ];
    return [
      { id: 'citas', label: 'Citas médicas', icon: CalendarDays },
      { id: 'usuarios', label: 'Usuarios', icon: Users },
      { id: 'especialidades', label: 'Especialidades', icon: Stethoscope },
      { id: 'reportes', label: 'Reportes', icon: BarChart3 },
      { id: 'notificaciones', label: 'Notificaciones', icon: Bell },
    ];
  }, [rol]);

  function ir(id) { setVista(id); setAviso(''); }
  function abrirHistoria(cita) { setDestinoHistoria({ pacienteId: cita.paciente_id, citaId: cita.id }); ir('historia'); }

  if (!sesion) return <Login onLogin={iniciarSesion} aviso={avisoLogin} />;

  const actual = menu.find((m) => m.id === vista) || menu[0];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark small"><HeartPulse size={22} /></div>
          <div><strong>Clínica</strong><small>GESTIÓN MÉDICA</small></div>
        </div>
        <div className="nav-caption">MENÚ PRINCIPAL</div>
        <nav aria-label="Menú principal">
          {menu.map((item) => (
            <button key={item.id} className={`nav-item ${actual.id === item.id ? 'active' : ''}`} aria-current={actual.id === item.id ? 'page' : undefined} onClick={() => ir(item.id)}>
              <item.icon size={18} />{item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">{user.nombre?.[0]}{user.apellido?.[0]}</div>
          <div className="profile"><strong>{user.nombre} {user.apellido}</strong><span>{ROLE_LABEL[rol] || rol}</span></div>
          <button className="icon-button logout" title="Cerrar sesión" aria-label="Cerrar sesión" onClick={() => cerrarSesion()}><LogOut size={18} /></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div><span className="crumb">Portal de salud</span><h1>{actual.label}</h1></div>
          <div className="top-actions">
            <span className={`status-dot ${datos.online ? '' : 'offline'}`}>{datos.online ? 'Sistema conectado' : 'Sin conexión con el servidor'}</span>
            <button className="outline" onClick={refrescar} disabled={datos.loading}>
              <RefreshCw size={15} className={datos.loading ? 'spin' : ''} /> Actualizar
            </button>
            <button className="outline logout-mobile" onClick={() => cerrarSesion()} aria-label="Cerrar sesión"><LogOut size={15} /></button>
          </div>
        </header>

        <div className="page-content">
          {datos.error && <Alert onClose={() => setDatos((d) => ({ ...d, error: '' }))}>{datos.error}</Alert>}
          {aviso && <Alert kind="success" onClose={() => setAviso('')}>{aviso}</Alert>}

          {actual.id === 'citas' && <Citas token={token} user={user} data={datos} onRefresh={refrescar} notify={setAviso} onHistoria={abrirHistoria} />}
          {actual.id === 'historia' && <Historia token={token} user={user} citas={datos.citas} target={destinoHistoria} />}
          {actual.id === 'notificaciones' && <Notificaciones token={token} />}
          {actual.id === 'usuarios' && <Usuarios token={token} user={user} especialidades={datos.especialidades} notify={setAviso} onChanged={refrescar} />}
          {actual.id === 'especialidades' && <Especialidades token={token} especialidades={datos.especialidades} medicos={datos.medicos} notify={setAviso} onChanged={refrescar} />}
          {actual.id === 'reportes' && <Reportes token={token} />}
        </div>
      </main>
    </div>
  );
}
