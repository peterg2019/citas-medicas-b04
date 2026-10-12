import React from 'react';
import { Bell, Mail, MessageSquare } from 'lucide-react';
import { useFetch } from '../hooks';
import { Alert, Empty, formatDateTime } from '../ui';

const ESTADO = { enviada: 'Enviada', simulada: 'Simulada', fallida: 'Fallida', pendiente: 'Pendiente' };

export default function Notificaciones({ token }) {
  const { data, loading, error } = useFetch('/notificaciones', token);
  const lista = data?.notificaciones || [];

  return (
    <section className="content-card">
      <div className="card-heading">
        <div><h3>Notificaciones</h3><p className="muted">Confirmaciones al agendar, reprogramar y cancelar citas.</p></div>
        <span className="count-pill">{lista.length} {lista.length === 1 ? 'mensaje' : 'mensajes'}</span>
      </div>
      {error && <div className="pad"><Alert>{error}</Alert></div>}
      {loading && !data ? (
        <Empty title="Cargando notificaciones…" />
      ) : !lista.length && !error ? (
        <Empty icon={Bell} title="No tienes notificaciones">Te avisaremos cuando una cita se agende, cambie o se cancele.</Empty>
      ) : (
        <ul className="notif-list">
          {lista.map((n) => (
            <li key={n.id}>
              <span className="notif-icon" aria-hidden="true">{n.tipo === 'sms' ? <MessageSquare size={17} /> : <Mail size={17} />}</span>
              <div className="notif-body">
                <p>{n.mensaje}</p>
                <small>{n.tipo === 'sms' ? 'Mensaje de texto' : 'Correo electrónico'} · {formatDateTime(n.creada_en)}</small>
              </div>
              <span className={`badge ${n.estado}`}>{ESTADO[n.estado] || n.estado}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="footnote pad-x">Los correos se envían si el servidor tiene correo configurado; los mensajes de texto se registran en modo simulado.</p>
    </section>
  );
}
