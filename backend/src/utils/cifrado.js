import crypto from 'node:crypto';
import { config } from '../config.js';

// Cifrado AES-256-GCM para datos clínicos sensibles (Ley 1581 de 2012).
const clave = Buffer.from(config.claveDatos, 'hex');

export function cifrar(texto) {
  if (texto === null || texto === undefined || texto === '') return null;
  const iv = crypto.randomBytes(12);
  const cifrador = crypto.createCipheriv('aes-256-gcm', clave, iv);
  const contenido = Buffer.concat([cifrador.update(String(texto), 'utf8'), cifrador.final()]);
  const etiqueta = cifrador.getAuthTag();
  return [iv, etiqueta, contenido].map((b) => b.toString('base64')).join('.');
}

export function descifrar(carga) {
  if (!carga) return null;
  const [iv, etiqueta, contenido] = carga.split('.').map((p) => Buffer.from(p, 'base64'));
  const descifrador = crypto.createDecipheriv('aes-256-gcm', clave, iv);
  descifrador.setAuthTag(etiqueta);
  return Buffer.concat([descifrador.update(contenido), descifrador.final()]).toString('utf8');
}
