import React from 'react';
import { render, screen, within, waitFor, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App.jsx';

const unico = Date.now();
const espera = { timeout: 15000 };

// Primer día de la semana indicada (1=lunes ... 5=viernes) que esté al menos `desdeDias` días adelante
function diaHabil(desdeDias, diaSemana) {
  const d = new Date(Date.now() + desdeDias * 86400000);
  while (d.getUTCDay() !== diaSemana) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const dmy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

beforeEach(() => { sessionStorage.clear(); window.confirm = () => true; });
afterEach(() => cleanup());

async function iniciar(correo, clave = 'Demo2026*') {
  const u = userEvent.setup();
  render(<App />);
  await u.type(screen.getByLabelText(/Correo electrónico/), correo);
  await u.type(screen.getByLabelText(/^Contraseña/), clave);
  await u.click(screen.getByRole('button', { name: 'Ingresar a mi cuenta' }));
  return u;
}
const entrado = () => screen.findAllByRole('button', { name: 'Cerrar sesión' }, espera); // menú lateral + barra móvil
const dialogo = () => screen.findByRole('dialog', {}, espera);
const irA = async (u, nombre) => u.click(within(screen.getByRole('navigation')).getByRole('button', { name: nombre }));
const filaCon = async (texto) => (await screen.findByText(texto, {}, espera)).closest('tr');

describe('RF-01 acceso y roles', () => {
  it('CP-02: contraseña incorrecta muestra el error y no entra', async () => {
    await iniciar('paciente1@clinica.test', 'incorrecta1');
    expect(await screen.findByText(/Correo o contraseña incorrectos/, {}, espera)).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: 'Cerrar sesión' }).length).toBe(0);
  });

  it('CP-01: paciente entra, ve solo sus citas y su menú', async () => {
    await iniciar('paciente1@clinica.test');
    await entrado();
    expect(await screen.findAllByText('Medicina General', {}, espera)).toBeTruthy();
    const filas = within(screen.getByRole('table')).getAllByRole('row');
    expect(filas.length - 1).toBe(3); // Juan Pérez tiene 3 citas de ejemplo
    const nav = within(screen.getByRole('navigation'));
    expect(nav.getByRole('button', { name: 'Historia clínica' })).toBeTruthy();
    expect(nav.queryByRole('button', { name: 'Usuarios' })).toBeNull();
    expect(nav.queryByRole('button', { name: 'Reportes' })).toBeNull();
  });

  it('CP-03: un paciente nuevo se registra y queda con sesión iniciada', async () => {
    const u = userEvent.setup();
    render(<App />);
    await u.click(screen.getByRole('button', { name: 'Regístrate como paciente' }));
    await u.type(screen.getByLabelText('Nombre'), 'Camila');
    await u.type(screen.getByLabelText('Apellido'), 'Rojas');
    await u.type(screen.getByLabelText(/Correo electrónico/), `camila${unico}@prueba.test`);
    await u.type(screen.getByLabelText('Documento'), `9${unico}`.slice(0, 15));
    await u.type(screen.getByLabelText(/^Teléfono/), '3001234567');
    await u.type(screen.getByLabelText(/^Contraseña/), 'Clave12345');
    await u.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));
    await entrado();
    expect(await screen.findByText('Hola, Camila.', {}, espera)).toBeTruthy();
    expect(await screen.findByText('Aún no hay citas registradas', {}, espera)).toBeTruthy();
  });

  it('CP-03b: el registro con contraseña débil muestra qué corregir', async () => {
    const u = userEvent.setup();
    render(<App />);
    await u.click(screen.getByRole('button', { name: 'Regístrate como paciente' }));
    await u.type(screen.getByLabelText('Nombre'), 'Ana');
    await u.type(screen.getByLabelText('Apellido'), 'Sola');
    await u.type(screen.getByLabelText(/Correo electrónico/), `debil${unico}@prueba.test`);
    await u.type(screen.getByLabelText('Documento'), `8${unico}`.slice(0, 15));
    await u.type(screen.getByLabelText(/^Contraseña/), 'abc');
    await u.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));
    expect(await screen.findByText(/al menos 8 caracteres/, {}, espera)).toBeTruthy();
  });

  it('sesión vencida: un token inválido devuelve al login con aviso', async () => {
    sessionStorage.setItem('citas-session', JSON.stringify({ token: 'token-falso', usuario: { id: 1, nombre: 'X', apellido: 'Y', rol: 'paciente', paciente_id: 1 } }));
    render(<App />);
    expect(await screen.findByText(/Tu sesión expiró/, {}, espera)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ingresar a mi cuenta' })).toBeTruthy();
  });
});

describe('RF-02 y RF-04: citas y notificaciones (paciente nuevo)', () => {
  const f1 = diaHabil(45, 2); // martes
  const f2 = diaHabil(46, 3); // miércoles
  const sabado = diaHabil(50, 6);
  let horaElegida;

  it('CP-06: un sábado avisa que solo se atiende de lunes a viernes', async () => {
    const u = await iniciar(`camila${unico}@prueba.test`, 'Clave12345');
    await entrado();
    await u.click(await screen.findByRole('button', { name: /Agendar cita/ }, espera));
    const d = await dialogo();
    await u.selectOptions(within(d).getByLabelText(/^Médico/), within(d).getByRole('option', { name: /Laura Gómez/ }));
    fireEvent.change(within(d).getByLabelText('Fecha'), { target: { value: sabado } });
    expect(await within(d).findByText(/lunes a viernes/, {}, espera)).toBeTruthy();
    expect(within(d).getByRole('button', { name: /Confirmar cita/ }).disabled).toBe(true);
  });

  it('CP-04 y CP-14: agenda eligiendo una hora libre y recibe la notificación', async () => {
    const u = await iniciar(`camila${unico}@prueba.test`, 'Clave12345');
    await entrado();
    await u.click(await screen.findByRole('button', { name: /Agendar cita/ }, espera));
    const d = await dialogo();
    await u.selectOptions(within(d).getByLabelText('Especialidad'), within(d).getByRole('option', { name: 'Medicina General' }));
    // el filtro por especialidad deja solo a los médicos de esa especialidad
    expect(within(d).queryByRole('option', { name: /Andrés Ruiz/ })).toBeNull();
    await u.selectOptions(within(d).getByLabelText(/^Médico/), within(d).getByRole('option', { name: /Laura Gómez/ }));
    fireEvent.change(within(d).getByLabelText('Fecha'), { target: { value: f1 } });
    const horas = await within(d).findAllByRole('button', { name: /^\d{2}:\d{2}$/ }, espera);
    expect(horas.length).toBe(18); // 08:00 a 16:30 sin reservas ese día
    horaElegida = horas[3].textContent; // 09:30
    await u.click(horas[3]);
    await u.type(within(d).getByLabelText(/Motivo/), 'Control general (prueba)');
    const inicio = performance.now();
    await u.click(within(d).getByRole('button', { name: /Confirmar cita/ }));
    expect(await screen.findByText(/La cita se agendó correctamente/, {}, espera)).toBeTruthy();
    expect(performance.now() - inicio).toBeLessThan(2000 + 500); // RNF-02 (margen por la simulación)
    const fila = await filaCon(dmy(f1));
    expect(within(fila).getByText('Programada')).toBeTruthy();
    expect(within(fila).getByText(horaElegida)).toBeTruthy();

    await irA(u, 'Notificaciones');
    expect(await screen.findByText(/quedó programada para el/, {}, espera)).toBeTruthy();
    expect(screen.getAllByText('Simulada').length).toBeGreaterThan(0);
    expect(screen.getByText(/mensajes de texto se registran en modo simulado/)).toBeTruthy();
  });

  it('CP-05: la hora reservada ya no aparece disponible para otro paciente', async () => {
    const u = await iniciar('paciente3@clinica.test');
    await entrado();
    await u.click(await screen.findByRole('button', { name: /Agendar cita/ }, espera));
    const d = await dialogo();
    await u.selectOptions(within(d).getByLabelText(/^Médico/), within(d).getByRole('option', { name: /Laura Gómez/ }));
    fireEvent.change(within(d).getByLabelText('Fecha'), { target: { value: f1 } });
    const horas = await within(d).findAllByRole('button', { name: /^\d{2}:\d{2}$/ }, espera);
    expect(horas.length).toBe(17);
    expect(horas.map((h) => h.textContent)).not.toContain(horaElegida);
  });

  it('CP-07 y CP-08: reprograma a otro día y luego cancela', async () => {
    const u = await iniciar(`camila${unico}@prueba.test`, 'Clave12345');
    await entrado();
    let fila = await filaCon(dmy(f1));
    await u.click(within(fila).getByRole('button', { name: 'Reprogramar' }));
    const d = await dialogo();
    fireEvent.change(within(d).getByLabelText('Fecha'), { target: { value: f2 } });
    const horas = await within(d).findAllByRole('button', { name: /^\d{2}:\d{2}$/ }, espera);
    await u.click(horas[0]);
    await u.click(within(d).getByRole('button', { name: /Guardar nueva fecha/ }));
    expect(await screen.findByText(/Cita reprogramada/, {}, espera)).toBeTruthy();
    fila = await filaCon(dmy(f2));
    expect(within(fila).getByText('Reprogramada')).toBeTruthy();
    expect(screen.queryByText(dmy(f1))).toBeNull();

    await u.click(within(fila).getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByText(/Cita cancelada/, {}, espera)).toBeTruthy();
    fila = await filaCon(dmy(f2));
    expect(within(fila).getByText('Cancelada')).toBeTruthy();
    expect(within(fila).queryByRole('button', { name: 'Cancelar' })).toBeNull();
  });
});

describe('RF-03: historias clínicas', () => {
  const diag = `Faringitis aguda (prueba ${unico})`;

  it('CP-09: el médico ve solo su agenda y marca una cita como atendida', async () => {
    const u = await iniciar('medico1@clinica.test');
    await entrado();
    expect(await screen.findByText('Agenda de atención', {}, espera)).toBeTruthy();
    const tabla = await screen.findByRole('table', {}, espera);
    await within(tabla).findByText('Revisión de presión arterial', {}, espera);
    expect(within(tabla).queryByText('Marta Peña')).toBeNull(); // citas de otro médico no aparecen
    const fila = within(tabla).getAllByRole('row').find((r) => within(r).queryByText('Revisión de presión arterial'));
    await u.click(within(fila).getByRole('button', { name: 'Marcar atendida' }));
    expect(await screen.findByText(/marcada como atendida/, {}, espera)).toBeTruthy();
  });

  it('CP-10 y CP-13: registra un diagnóstico y luego lo corrige sin perder el original', async () => {
    const u = await iniciar('medico1@clinica.test');
    await entrado();
    await irA(u, 'Historias clínicas');
    expect(await screen.findByText('Mis pacientes', {}, espera)).toBeTruthy();
    await u.click(screen.getByRole('button', { name: /Juan Pérez/ }));
    expect(await screen.findByText('Hipertensión arterial leve', {}, espera)).toBeTruthy(); // registro de ejemplo descifrado

    await u.click(screen.getByRole('button', { name: /Nuevo registro/ }));
    let d = await dialogo();
    await u.type(within(d).getByLabelText('Diagnóstico'), diag);
    await u.type(within(d).getByLabelText(/Tratamiento/), 'Reposo e hidratación');
    await u.click(within(d).getByRole('button', { name: 'Guardar registro' }));
    expect(await screen.findByText('Registro clínico guardado.', {}, espera)).toBeTruthy();
    const original = (await screen.findByText(diag, {}, espera)).closest('article');

    await u.click(within(original).getByRole('button', { name: /Corregir este registro/ }));
    d = await dialogo();
    const campo = within(d).getByLabelText('Diagnóstico');
    expect(campo.value).toBe(diag); // se precarga para editar
    await u.clear(campo);
    await u.type(campo, 'Amigdalitis aguda (corregido)');
    await u.click(within(d).getByRole('button', { name: 'Guardar corrección' }));
    expect(await screen.findByText(/El registro original se conserva/, {}, espera)).toBeTruthy();
    expect(await screen.findByText('Amigdalitis aguda (corregido)', {}, espera)).toBeTruthy();
    expect(screen.getByText(diag)).toBeTruthy(); // el original sigue visible (historial inmutable)
    expect(screen.getByText('Corrige un registro anterior')).toBeTruthy();
    expect(screen.getByText('Tiene una corrección posterior')).toBeTruthy();
  });

  it('CP-12: el paciente ve su historia con lo que registró el médico', async () => {
    const u = await iniciar('paciente1@clinica.test');
    await entrado();
    await irA(u, 'Historia clínica');
    expect(await screen.findByText('Amigdalitis aguda (corregido)', {}, espera)).toBeTruthy();
    expect(screen.getByText('Hipertensión arterial leve')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Nuevo registro/ })).toBeNull(); // el paciente no escribe
  });

  it('CP-11: un médico sin pacientes no ve historias ajenas', async () => {
    const u = await iniciar('medico4@clinica.test'); // Carlos Díaz solo atiende a Luis Mora
    await entrado();
    await irA(u, 'Historias clínicas');
    await screen.findByText('Mis pacientes', {}, espera);
    expect(screen.queryByRole('button', { name: /Juan Pérez/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Luis Mora/ })).toBeTruthy();
  });
});

describe('RF-05: administración', () => {
  it('CP-15 y CP-16: crea un médico, aparece en la lista y se puede desactivar', async () => {
    const u = await iniciar('admin@clinica.test');
    await entrado();
    await irA(u, 'Usuarios');
    await u.click(await screen.findByRole('button', { name: /Nuevo usuario/ }, espera));
    const d = await dialogo();
    await u.type(within(d).getByLabelText('Nombre'), 'Sofía');
    await u.type(within(d).getByLabelText('Apellido'), 'Vargas');
    await u.type(within(d).getByLabelText('Correo electrónico'), `sofia${unico}@clinica.test`);
    await u.type(within(d).getByLabelText(/^Contraseña/), 'Clave12345');
    await u.selectOptions(within(d).getByLabelText('Especialidad'), within(d).getByRole('option', { name: 'Ginecología' }));
    await u.click(within(d).getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByText(/Cuenta creada: Sofía Vargas/, {}, espera)).toBeTruthy();

    const fila = await filaCon(`Sofía Vargas`);
    expect(within(fila).getByText('Activo')).toBeTruthy();
    await u.click(within(fila).getByRole('button', { name: 'Desactivar' }));
    expect(await screen.findByText(/Se desactivó la cuenta de Sofía Vargas/, {}, espera)).toBeTruthy();
    await waitFor(async () => expect(within(await filaCon('Sofía Vargas')).getByText('Inactivo')).toBeTruthy(), espera);
    // el administrador no puede desactivarse a sí mismo
    expect(within(screen.getByRole('table')).getByText('Tu cuenta')).toBeTruthy();
  });

  it('CP-16b: la cuenta desactivada ya no puede iniciar sesión', async () => {
    await iniciar(`sofia${unico}@clinica.test`, 'Clave12345');
    expect(await screen.findByText(/Correo o contraseña incorrectos/, {}, espera)).toBeTruthy();
  });

  it('crea una especialidad nueva', async () => {
    const u = await iniciar('admin@clinica.test');
    await entrado();
    await irA(u, 'Especialidades');
    await u.type(await screen.findByLabelText('Nombre de la nueva especialidad', {}, espera), 'Neurología');
    await u.click(screen.getByRole('button', { name: /Agregar especialidad/ }));
    expect(await screen.findByText(/Especialidad “Neurología” creada/, {}, espera)).toBeTruthy();
    expect(await screen.findByText('Neurología', { selector: 'strong' }, espera)).toBeTruthy();
  });

  it('el administrador agenda a nombre de un paciente', async () => {
    const f = diaHabil(60, 4);
    const u = await iniciar('admin@clinica.test');
    await entrado();
    await u.click(await screen.findByRole('button', { name: /Agendar cita/ }, espera));
    const d = await dialogo();
    await u.selectOptions(within(d).getByLabelText('Paciente'), await within(d).findByRole('option', { name: /Luis Mora/ }, espera));
    await u.selectOptions(within(d).getByLabelText(/^Médico/), within(d).getByRole('option', { name: /Marta Peña/ }));
    fireEvent.change(within(d).getByLabelText('Fecha'), { target: { value: f } });
    await u.click((await within(d).findAllByRole('button', { name: /^\d{2}:\d{2}$/ }, espera))[0]);
    await u.click(within(d).getByRole('button', { name: /Confirmar cita/ }));
    expect(await screen.findByText(/La cita se agendó correctamente/, {}, espera)).toBeTruthy();
    const fila = await filaCon(dmy(f));
    expect(within(fila).getByText('Luis Mora')).toBeTruthy();
  });

  it('muestra reportes con gráficas y auditoría', async () => {
    const u = await iniciar('admin@clinica.test');
    await entrado();
    await irA(u, 'Reportes');
    expect(await screen.findByText('Citas por estado', {}, espera)).toBeTruthy();
    expect(screen.getByText('Citas por especialidad')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Citas por día en los próximos 14 días/ })).toBeTruthy();
    expect(await screen.findAllByText('Inicio de sesión', {}, espera)).toBeTruthy();
    expect(screen.getAllByText('Registro clínico creado').length).toBeGreaterThan(0);
  });
});
