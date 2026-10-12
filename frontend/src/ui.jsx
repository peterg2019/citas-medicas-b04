import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export const ROLE_LABEL = { paciente: 'Paciente', medico: 'Médico', administrador: 'Administrador' };

const pad = (n) => String(n).padStart(2, '0');
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const isWeekend = (fecha) => {
  if (!fecha) return false;
  const dia = new Date(`${fecha}T00:00:00Z`).getUTCDay();
  return dia === 0 || dia === 6;
};

const ESTADOS = { programada: 'Programada', reprogramada: 'Reprogramada', cancelada: 'Cancelada', atendida: 'Atendida' };
export const statusLabel = (s) => ESTADOS[s] || s;
export const isPending = (c) => ['programada', 'reprogramada'].includes(c.estado);

export function formatDate(s) {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}
export function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' });
}

export function Stat({ icon: Icon, label, value, tone }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${tone}`}><Icon size={20} /></div>
      <div><span>{label}</span><strong>{value ?? '—'}</strong></div>
    </article>
  );
}

export function Alert({ kind = 'error', children, onClose }) {
  return (
    <div className={`alert ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      {onClose && (
        <button type="button" className="alert-close" aria-label="Cerrar mensaje" onClick={onClose}><X size={16} /></button>
      )}
    </div>
  );
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="empty">
      {Icon && <Icon size={30} />}
      {title && <strong>{title}</strong>}
      {children && <span>{children}</span>}
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const alTeclear = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-heading">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar"><X /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
