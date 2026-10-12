// Pruebas de integración. Requieren la base inicializada y con datos de ejemplo:
//   npm run db:reset && npm run db:seed && npm test
process.env.LOGIN_RATE_LIMIT = '1000';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { app } = await import('../src/app.js');
const { pool, query } = await import('../src/db/pool.js');

let servidor;
let base;
const unico = Date.now();

before(async () => {
  await new Promise((ok) => { servidor = app.listen(0, ok); });
  base = `http://localhost:${servidor.address().port}`;
});
after(async () => {
  await new Promise((ok) => servidor.close(ok));
  await pool.end();
});

async function api(metodo, ruta, { token, cuerpo } = {}) {
  const inicio = performance.now();
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await r.json().catch(() => ({}));
  return { estado: r.status, datos, ms: performance.now() - inicio };
}
const login = async (correo, password = 'Demo2026*') => (await api('POST', '/api/auth/login', { cuerpo: { correo, password } })).datos;

// Día hábil aleatorio dentro de 30-150 días y una hora al azar (evita choques entre ejecuciones)
function franjaAleatoria() {
  let d;
  do {
    d = new Date(Date.now() + (30 + Math.floor(Math.random() * 120)) * 86400000);
  } while ([0, 6].includes(d.getUTCDay()));
  const horas = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'];
  return { fecha: d.toISOString().slice(0, 10), hora: horas[Math.floor(Math.random() * horas.length)] };
}

const ctx = {};

test('Sistema: health y documentación Swagger', async () => {
  const h = await api('GET', '/api/health');
  assert.equal(h.estado, 200);
  assert.equal(h.datos.baseDatos, 'conectada');
  const s = await api('GET', '/api-docs.json');
  assert.equal(s.estado, 200);
  assert.ok(s.datos.paths['/api/citas']);
});

test('Seguridad: rutas protegidas exigen token', async () => {
  assert.equal((await api('GET', '/api/citas')).estado, 401);
  assert.equal((await api('GET', '/api/usuarios', { token: 'falso' })).estado, 401);
});

test('RF-01: registro de paciente con validaciones', async () => {
  const debil = await api('POST', '/api/auth/registro', { cuerpo: {
    nombre: 'Test', apellido: 'Uno', correo: `t${unico}@prueba.test`, password: 'abc', documento: `D${unico}` } });
  assert.equal(debil.estado, 400);

  const ok = await api('POST', '/api/auth/registro', { cuerpo: {
    nombre: 'Test', apellido: 'Uno', correo: `t${unico}@prueba.test`, password: 'Clave1234', documento: `D${unico}`, telefono: '3000000000' } });
  assert.equal(ok.estado, 201);
  assert.equal(ok.datos.usuario.rol, 'paciente');
  ctx.pac1 = ok.datos;

  const dup = await api('POST', '/api/auth/registro', { cuerpo: {
    nombre: 'Test', apellido: 'Uno', correo: `t${unico}@prueba.test`, password: 'Clave1234', documento: `X${unico}` } });
  assert.equal(dup.estado, 409);

  const ok2 = await api('POST', '/api/auth/registro', { cuerpo: {
    nombre: 'Test', apellido: 'Dos', correo: `t2${unico}@prueba.test`, password: 'Clave1234', documento: `E${unico}` } });
  ctx.pac2 = ok2.datos;
});

test('RF-01: login correcto e incorrecto; la contraseña se guarda cifrada', async () => {
  assert.equal((await api('POST', '/api/auth/login', { cuerpo: { correo: 'admin@clinica.test', password: 'mala' } })).estado, 401);
  ctx.admin = await login('admin@clinica.test');
  assert.equal(ctx.admin.usuario.rol, 'administrador');
  const { rows } = await query('SELECT password_hash FROM usuarios WHERE correo = $1', ['admin@clinica.test']);
  assert.ok(rows[0].password_hash.startsWith('$2'), 'bcrypt');
  assert.ok(!rows[0].password_hash.includes('Demo2026'));
});

test('RF-01/RF-05: control de acceso por rol en administración', async () => {
  assert.equal((await api('GET', '/api/usuarios', { token: ctx.pac1.token })).estado, 403);
  const lista = await api('GET', '/api/usuarios?rol=medico', { token: ctx.admin.token });
  assert.equal(lista.estado, 200);
  assert.ok(lista.datos.usuarios.length >= 4);

  const esp = (await api('GET', '/api/especialidades', { token: ctx.admin.token })).datos.especialidades[0];
  const nuevo = await api('POST', '/api/usuarios', { token: ctx.admin.token, cuerpo: {
    nombre: 'Medico', apellido: 'Nuevo', correo: `m${unico}@prueba.test`, password: 'Clave1234', rol: 'medico', especialidad_id: esp.id } });
  assert.equal(nuevo.estado, 201);
  ctx.medicoNuevo = nuevo.datos.usuario;
  ctx.medicoNuevoLogin = await login(`m${unico}@prueba.test`, 'Clave1234');

  const sinEsp = await api('POST', '/api/usuarios', { token: ctx.admin.token, cuerpo: {
    nombre: 'X', apellido: 'Y', correo: `z${unico}@prueba.test`, password: 'Clave1234', rol: 'medico' } });
  assert.equal(sinEsp.estado, 400);
});

test('RF-02: disponibilidad, agendamiento y validaciones de franja', async () => {
  ctx.slot = franjaAleatoria();
  const mid = ctx.medicoNuevo.medico_id;

  const antes = await api('GET', `/api/medicos/${mid}/disponibilidad?fecha=${ctx.slot.fecha}`, { token: ctx.pac1.token });
  assert.ok(antes.datos.disponibles.includes(ctx.slot.hora));

  // Criterio de aceptación: la reserva responde en menos de 2 segundos
  const c = await api('POST', '/api/citas', { token: ctx.pac1.token, cuerpo: { medico_id: mid, ...ctx.slot, motivo: 'Prueba' } });
  assert.equal(c.estado, 201, JSON.stringify(c.datos));
  assert.ok(c.ms < 2000, `La reserva tardó ${c.ms.toFixed(0)} ms`);
  ctx.cita = c.datos.cita;

  const despues = await api('GET', `/api/medicos/${mid}/disponibilidad?fecha=${ctx.slot.fecha}`, { token: ctx.pac1.token });
  assert.ok(!despues.datos.disponibles.includes(ctx.slot.hora));

  // Fecha pasada, fin de semana y hora fuera de agenda
  assert.equal((await api('POST', '/api/citas', { token: ctx.pac1.token, cuerpo: { medico_id: mid, fecha: '2020-01-06', hora: '09:00' } })).estado, 400);
  assert.equal((await api('POST', '/api/citas', { token: ctx.pac1.token, cuerpo: { medico_id: mid, fecha: '2030-01-05', hora: '09:00' } })).estado, 400);
  assert.equal((await api('POST', '/api/citas', { token: ctx.pac1.token, cuerpo: { medico_id: mid, fecha: ctx.slot.fecha, hora: '09:17' } })).estado, 400);
});

test('RF-02: impide reserva doble (mismo médico y franja)', async () => {
  const doble = await api('POST', '/api/citas', { token: ctx.pac2.token, cuerpo: { medico_id: ctx.medicoNuevo.medico_id, ...ctx.slot } });
  assert.equal(doble.estado, 409);
  assert.match(doble.datos.error, /ya tiene una cita/);
});

test('RF-02: reservas simultáneas en la misma franja solo permiten una', async () => {
  const slot = franjaAleatoria();
  const mid = ctx.medicoNuevo.medico_id;
  const resultados = await Promise.all([ctx.pac1, ctx.pac2].map((p) =>
    api('POST', '/api/citas', { token: p.token, cuerpo: { medico_id: mid, ...slot } })));
  const estados = resultados.map((r) => r.estado).sort();
  assert.deepEqual(estados, [201, 409]);
  // limpieza: cancelar la que se creó
  const ganador = resultados.findIndex((r) => r.estado === 201);
  const token = [ctx.pac1, ctx.pac2][ganador].token;
  await api('PATCH', `/api/citas/${resultados[ganador].datos.cita.id}/cancelar`, { token });
});

test('RF-02: un paciente no puede tener dos citas a la misma hora', async () => {
  const otro = (await api('GET', '/api/medicos', { token: ctx.pac1.token })).datos.medicos.find((m) => m.id !== ctx.medicoNuevo.medico_id);
  const r = await api('POST', '/api/citas', { token: ctx.pac1.token, cuerpo: { medico_id: otro.id, ...ctx.slot } });
  assert.equal(r.estado, 409);
  assert.match(r.datos.error, /paciente/);
});

test('RF-02: privacidad de citas por rol', async () => {
  const ajena = await api('GET', `/api/citas/${ctx.cita.id}`, { token: ctx.pac2.token });
  assert.equal(ajena.estado, 403);
  const propia = await api('GET', '/api/citas', { token: ctx.pac1.token });
  assert.ok(propia.datos.citas.every((c) => c.paciente_id === ctx.pac1.usuario.paciente_id));
  const agendaMedico = await api('GET', '/api/citas', { token: ctx.medicoNuevoLogin.token });
  assert.ok(agendaMedico.datos.citas.some((c) => c.id === ctx.cita.id));
  const todas = await api('GET', '/api/citas', { token: ctx.admin.token });
  assert.ok(todas.datos.citas.length >= 7);
});

test('RF-02/RF-04: reprogramar y cancelar liberan la franja y generan notificaciones', async () => {
  const nueva = franjaAleatoria();
  const rep = await api('PATCH', `/api/citas/${ctx.cita.id}/reprogramar`, { token: ctx.pac1.token, cuerpo: nueva });
  assert.equal(rep.estado, 200, JSON.stringify(rep.datos));
  assert.equal(rep.datos.cita.estado, 'reprogramada');

  const liberada = await api('GET', `/api/medicos/${ctx.medicoNuevo.medico_id}/disponibilidad?fecha=${ctx.slot.fecha}`, { token: ctx.pac1.token });
  assert.ok(liberada.datos.disponibles.includes(ctx.slot.hora));

  const notis = await api('GET', '/api/notificaciones', { token: ctx.pac1.token });
  assert.ok(notis.datos.notificaciones.length >= 2);
  assert.ok(notis.datos.notificaciones.every((n) => ['simulada', 'enviada'].includes(n.estado)));
  assert.ok(notis.datos.notificaciones.some((n) => n.tipo === 'sms'));

  ctx.slot = nueva; // la cita queda en la nueva franja
});

test('RF-03: historias clínicas, autorización, cifrado e inmutabilidad', async () => {
  const pid = ctx.pac1.usuario.paciente_id;
  // Otro paciente y el administrador no pueden leerla
  assert.equal((await api('GET', `/api/historias/paciente/${pid}`, { token: ctx.pac2.token })).estado, 403);
  assert.equal((await api('GET', `/api/historias/paciente/${pid}`, { token: ctx.admin.token })).estado, 403);

  // Un médico sin citas con el paciente tampoco
  const sinRelacion = await login('medico4@clinica.test');
  assert.equal((await api('GET', `/api/historias/paciente/${pid}`, { token: sinRelacion.token })).estado, 403);
  assert.equal((await api('POST', `/api/historias/paciente/${pid}/registros`, { token: sinRelacion.token, cuerpo: { diagnostico: 'x' } })).estado, 403);

  // El médico con cita sí puede registrar y consultar
  const dx = 'Diagnóstico de prueba confidencial XYZ';
  const crear = await api('POST', `/api/historias/paciente/${pid}/registros`, {
    token: ctx.medicoNuevoLogin.token, cuerpo: { diagnostico: dx, tratamiento: 'Reposo', cita_id: ctx.cita.id } });
  assert.equal(crear.estado, 201, JSON.stringify(crear.datos));
  const registroId = crear.datos.registro.id;

  const lectura = await api('GET', `/api/historias/paciente/${pid}`, { token: ctx.medicoNuevoLogin.token });
  assert.equal(lectura.estado, 200);
  assert.equal(lectura.datos.registros[0].diagnostico, dx);

  // El paciente puede leer su propia historia
  const propia = await api('GET', `/api/historias/paciente/${pid}`, { token: ctx.pac1.token });
  assert.equal(propia.datos.registros[0].diagnostico, dx);

  // En la base de datos el contenido está cifrado
  const crudo = await query('SELECT diagnostico, tratamiento FROM registros_clinicos WHERE id = $1', [registroId]);
  assert.ok(!crudo.rows[0].diagnostico.includes('confidencial'));
  assert.ok(!crudo.rows[0].tratamiento.includes('Reposo'));

  // Una corrección es un registro nuevo que referencia al anterior
  const corr = await api('POST', `/api/historias/paciente/${pid}/registros`, {
    token: ctx.medicoNuevoLogin.token, cuerpo: { diagnostico: 'Diagnóstico corregido', corrige_registro_id: registroId } });
  assert.equal(corr.estado, 201);

  // Inmutabilidad: la base rechaza UPDATE y DELETE
  await assert.rejects(query('UPDATE registros_clinicos SET diagnostico = $1 WHERE id = $2', ['alterado', registroId]), /inmutable/);
  await assert.rejects(query('DELETE FROM registros_clinicos WHERE id = $1', [registroId]), /inmutable/);

  // La cita pasó a atendida al registrar con cita_id
  const c = await api('GET', `/api/citas/${ctx.cita.id}`, { token: ctx.pac1.token });
  assert.equal(c.datos.cita.estado, 'atendida');
});

test('RF-05: reportes y auditoría para el administrador', async () => {
  const r = await api('GET', '/api/reportes/resumen', { token: ctx.admin.token });
  assert.equal(r.estado, 200);
  assert.ok(r.datos.total_citas > 0);
  assert.ok(Array.isArray(r.datos.citas_por_estado));
  assert.equal((await api('GET', '/api/reportes/resumen', { token: ctx.pac1.token })).estado, 403);

  const a = await api('GET', '/api/reportes/auditoria?limite=200', { token: ctx.admin.token });
  const acciones = new Set(a.datos.auditoria.map((e) => e.accion));
  for (const esperada of ['login', 'crear_cita', 'consultar_historia', 'crear_registro_clinico']) {
    assert.ok(acciones.has(esperada), `Falta auditoría de ${esperada}`);
  }
  await assert.rejects(query('DELETE FROM auditoria WHERE id = (SELECT max(id) FROM auditoria)'), /inmutable/);
});

test('RF-01: usuario desactivado no puede usar su sesión', async () => {
  const des = await api('PATCH', `/api/usuarios/${ctx.pac2.usuario.id}`, { token: ctx.admin.token, cuerpo: { activo: false } });
  assert.equal(des.estado, 200);
  assert.equal((await api('GET', '/api/auth/me', { token: ctx.pac2.token })).estado, 401);
  assert.equal((await api('POST', '/api/auth/login', { cuerpo: { correo: `t2${unico}@prueba.test`, password: 'Clave1234' } })).estado, 401);
});
