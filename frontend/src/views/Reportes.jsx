import React, { useMemo } from 'react';
import { Activity, CalendarDays, Users } from 'lucide-react';
import { useFetch } from '../hooks';
import { Alert, Empty, ROLE_LABEL, Stat, formatDateTime, statusLabel } from '../ui';

const ACCIONES = {
  login: 'Inicio de sesión', login_fallido: 'Intento de inicio fallido', registro_paciente: 'Registro de paciente',
  crear_usuario: 'Creación de usuario', editar_usuario: 'Edición de usuario', crear_especialidad: 'Creación de especialidad',
  crear_cita: 'Cita agendada', reprogramar_cita: 'Cita reprogramada', cancelar_cita: 'Cita cancelada', atender_cita: 'Cita atendida',
  consultar_historia: 'Consulta de historia clínica', crear_registro_clinico: 'Registro clínico creado',
};

function BarList({ items, vacio }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="muted pad">{vacio}</p>;
  return (
    <ul className="bars">
      {items.map((i) => (
        <li key={i.label}>
          <span className="bar-label">{i.label}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${(i.value / max) * 100}%` }} /></span>
          <strong>{i.value}</strong>
        </li>
      ))}
    </ul>
  );
}

// Completa los próximos 14 días (incluidos los días sin citas) a partir de la fecha del servidor
function catorceDias(desde, filas) {
  const porFecha = new Map(filas.map((f) => [f.fecha, f.total]));
  const base = new Date(`${desde}T00:00:00Z`);
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(base); d.setUTCDate(base.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    return { label: `${iso.slice(8, 10)}/${iso.slice(5, 7)}`, value: porFecha.get(iso) || 0 };
  });
}

export default function Reportes({ token }) {
  const resumen = useFetch('/reportes/resumen', token);
  const auditoria = useFetch('/reportes/auditoria?limite=15', token);
  const r = resumen.data;

  const dias = useMemo(() => (r ? catorceDias(r.generado_para, r.citas_proximos_14_dias) : []), [r]);
  const maxDia = Math.max(1, ...dias.map((d) => d.value));

  if (resumen.error) return <Alert>{resumen.error}</Alert>;
  if (!r) return <Empty title="Cargando reportes…" />;

  const totalUsuarios = r.usuarios_por_rol.reduce((n, x) => n + x.total, 0);

  return (
    <>
      <section className="stats-grid">
        <Stat icon={CalendarDays} label="Citas totales" value={r.total_citas} tone="teal" />
        <Stat icon={Users} label="Usuarios activos" value={totalUsuarios} tone="blue" />
        <Stat icon={Activity} label="Especialidades con citas" value={r.citas_por_especialidad.length} tone="violet" />
      </section>

      <div className="charts-grid">
        <section className="content-card">
          <div className="card-heading"><div><h3>Citas por estado</h3></div></div>
          <BarList items={r.citas_por_estado.map((x) => ({ label: statusLabel(x.estado), value: x.total }))} vacio="Aún no hay citas." />
        </section>
        <section className="content-card">
          <div className="card-heading"><div><h3>Usuarios activos por rol</h3></div></div>
          <BarList items={r.usuarios_por_rol.map((x) => ({ label: ROLE_LABEL[x.rol] || x.rol, value: x.total }))} vacio="Aún no hay usuarios." />
        </section>
        <section className="content-card">
          <div className="card-heading"><div><h3>Citas por especialidad</h3><p className="muted">Sin contar las canceladas</p></div></div>
          <BarList items={r.citas_por_especialidad.map((x) => ({ label: x.especialidad, value: x.total }))} vacio="Aún no hay citas." />
        </section>
        <section className="content-card">
          <div className="card-heading"><div><h3>Agenda de los próximos 14 días</h3><p className="muted">Citas no canceladas por día</p></div></div>
          <div className="columns" role="img" aria-label={`Citas por día en los próximos 14 días: ${dias.map((d) => `${d.label}: ${d.value}`).join(', ')}`}>
            {dias.map((d) => (
              <div className="col" key={d.label}>
                <span className="col-val">{d.value || ''}</span>
                <span className="col-bar" style={{ height: `${Math.max(3, (d.value / maxDia) * 100)}%` }} />
                <span className="col-label">{d.label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="content-card" style={{ marginTop: 16 }}>
        <div className="card-heading">
          <div><h3>Auditoría reciente</h3><p className="muted">Registro permanente de acciones sensibles; no se puede editar ni borrar.</p></div>
        </div>
        {auditoria.error && <div className="pad"><Alert>{auditoria.error}</Alert></div>}
        {auditoria.data && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th></tr></thead>
              <tbody>
                {auditoria.data.auditoria.map((a) => (
                  <tr key={a.id}>
                    <td>{formatDateTime(a.fecha)}</td>
                    <td>{a.usuario || '—'}</td>
                    <td>{ACCIONES[a.accion] || a.accion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
