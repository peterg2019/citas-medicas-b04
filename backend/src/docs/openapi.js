// Documentación OpenAPI 3.0 (Swagger UI en /api-docs)
const json = (schema) => ({ 'application/json': { schema } });
const ok = (descripcion, schema) => ({ description: descripcion, content: schema ? json(schema) : undefined });
const err = (descripcion) => ({ description: descripcion, content: json({ $ref: '#/components/schemas/Error' }) });
const seguro = [{ bearerAuth: [] }];
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer' } };

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'API - Sistema Web de Gestión de Citas Médicas e Historias Clínicas',
    version: '1.0.0',
    description:
      'API REST del proyecto. Autenticación con token JWT (Bearer). Roles: paciente, medico, administrador.\n\n' +
      'Para probar: ejecuta POST /api/auth/login, copia el token y pulsa "Authorize".',
  },
  tags: [
    { name: 'Autenticación' }, { name: 'Usuarios (administrador)' }, { name: 'Catálogos' },
    { name: 'Citas' }, { name: 'Historias clínicas' }, { name: 'Notificaciones' }, { name: 'Reportes' }, { name: 'Sistema' },
  ],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'string' }, detalles: { type: 'array', items: { type: 'object' } } } },
      Usuario: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, nombre: { type: 'string' }, apellido: { type: 'string' }, correo: { type: 'string' },
          rol: { type: 'string', enum: ['paciente', 'medico', 'administrador'] },
          paciente_id: { type: 'integer', nullable: true }, medico_id: { type: 'integer', nullable: true },
        },
      },
      Cita: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, fecha: { type: 'string', example: '2026-10-20' }, hora: { type: 'string', example: '09:30' },
          motivo: { type: 'string' }, estado: { type: 'string', enum: ['programada', 'reprogramada', 'cancelada', 'atendida'] },
          paciente_id: { type: 'integer' }, paciente: { type: 'string' },
          medico_id: { type: 'integer' }, medico: { type: 'string' }, especialidad: { type: 'string' },
        },
      },
    },
  },
  paths: {
    '/api/health': { get: { tags: ['Sistema'], summary: 'Estado del servicio y de la base de datos', responses: { 200: ok('Servicio activo') } } },
    '/api/auth/registro': {
      post: {
        tags: ['Autenticación'], summary: 'Registro de paciente (RF-01)',
        requestBody: { required: true, content: json({
          type: 'object', required: ['nombre', 'apellido', 'correo', 'password', 'documento'],
          properties: { nombre: { type: 'string' }, apellido: { type: 'string' }, correo: { type: 'string' },
            password: { type: 'string', description: 'Mínimo 8 caracteres, con letras y números' },
            documento: { type: 'string' }, telefono: { type: 'string' }, direccion: { type: 'string' },
            fecha_nacimiento: { type: 'string', example: '1995-04-30' } } }) },
        responses: { 201: ok('Paciente creado; devuelve token y usuario'), 400: err('Datos inválidos'), 409: err('Correo o documento duplicado') },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Autenticación'], summary: 'Inicio de sesión',
        requestBody: { required: true, content: json({
          type: 'object', required: ['correo', 'password'],
          properties: { correo: { type: 'string', example: 'paciente1@clinica.test' }, password: { type: 'string', example: 'Demo2026*' } } }) },
        responses: { 200: ok('Token JWT y usuario'), 401: err('Credenciales incorrectas'), 429: err('Demasiados intentos') },
      },
    },
    '/api/auth/me': { get: { tags: ['Autenticación'], summary: 'Usuario autenticado', security: seguro, responses: { 200: ok('Usuario'), 401: err('Sin sesión') } } },
    '/api/usuarios': {
      get: { tags: ['Usuarios (administrador)'], summary: 'Listar usuarios (filtros: rol, q)', security: seguro,
        parameters: [{ name: 'rol', in: 'query', schema: { type: 'string' } }, { name: 'q', in: 'query', schema: { type: 'string' } }],
        responses: { 200: ok('Lista de usuarios'), 403: err('Solo administrador') } },
      post: { tags: ['Usuarios (administrador)'], summary: 'Crear usuario de cualquier rol (RF-05)', security: seguro,
        requestBody: { required: true, content: json({
          type: 'object', required: ['nombre', 'apellido', 'correo', 'password', 'rol'],
          properties: { nombre: { type: 'string' }, apellido: { type: 'string' }, correo: { type: 'string' }, password: { type: 'string' },
            rol: { type: 'string', enum: ['paciente', 'medico', 'administrador'] },
            especialidad_id: { type: 'integer', description: 'Obligatorio para médicos' },
            registro_medico: { type: 'string' }, documento: { type: 'string', description: 'Obligatorio para pacientes' } } }) },
        responses: { 201: ok('Usuario creado'), 400: err('Datos inválidos'), 409: err('Correo duplicado') } },
    },
    '/api/usuarios/{id}': {
      patch: { tags: ['Usuarios (administrador)'], summary: 'Editar o activar/desactivar usuario', security: seguro, parameters: [idParam],
        requestBody: { required: true, content: json({ type: 'object',
          properties: { nombre: { type: 'string' }, apellido: { type: 'string' }, activo: { type: 'boolean' }, especialidad_id: { type: 'integer' } } }) },
        responses: { 200: ok('Usuario actualizado'), 404: err('No encontrado') } },
    },
    '/api/especialidades': {
      get: { tags: ['Catálogos'], summary: 'Listar especialidades', security: seguro, responses: { 200: ok('Especialidades') } },
      post: { tags: ['Catálogos'], summary: 'Crear especialidad (administrador)', security: seguro,
        requestBody: { required: true, content: json({ type: 'object', required: ['nombre'], properties: { nombre: { type: 'string' } } }) },
        responses: { 201: ok('Creada'), 409: err('Ya existe') } },
    },
    '/api/medicos': {
      get: { tags: ['Catálogos'], summary: 'Listar médicos activos (filtro: especialidad_id)', security: seguro,
        parameters: [{ name: 'especialidad_id', in: 'query', schema: { type: 'integer' } }], responses: { 200: ok('Médicos') } },
    },
    '/api/medicos/{id}/disponibilidad': {
      get: { tags: ['Catálogos'], summary: 'Franjas libres de un médico en una fecha (RF-02)', security: seguro,
        parameters: [idParam, { name: 'fecha', in: 'query', required: true, schema: { type: 'string', example: '2026-10-20' } }],
        responses: { 200: ok('Horas disponibles'), 404: err('Médico no encontrado') } },
    },
    '/api/citas': {
      get: { tags: ['Citas'], summary: 'Listar citas según el rol', security: seguro,
        parameters: [
          { name: 'estado', in: 'query', schema: { type: 'string' } },
          { name: 'desde', in: 'query', schema: { type: 'string' } },
          { name: 'hasta', in: 'query', schema: { type: 'string' } },
        ], responses: { 200: ok('Citas', { type: 'object', properties: { citas: { type: 'array', items: { $ref: '#/components/schemas/Cita' } } } }) } },
      post: { tags: ['Citas'], summary: 'Agendar cita (RF-02)', security: seguro,
        requestBody: { required: true, content: json({ type: 'object', required: ['medico_id', 'fecha', 'hora'],
          properties: { medico_id: { type: 'integer' }, fecha: { type: 'string', example: '2026-10-20' },
            hora: { type: 'string', example: '09:30' }, motivo: { type: 'string' },
            paciente_id: { type: 'integer', description: 'Solo para administrador' } } }) },
        responses: { 201: ok('Cita creada'), 400: err('Franja inválida'), 409: err('Franja ocupada') } },
    },
    '/api/citas/{id}': { get: { tags: ['Citas'], summary: 'Detalle de una cita', security: seguro, parameters: [idParam], responses: { 200: ok('Cita'), 403: err('Sin acceso'), 404: err('No encontrada') } } },
    '/api/citas/{id}/reprogramar': {
      patch: { tags: ['Citas'], summary: 'Reprogramar cita', security: seguro, parameters: [idParam],
        requestBody: { required: true, content: json({ type: 'object', required: ['fecha', 'hora'], properties: { fecha: { type: 'string' }, hora: { type: 'string' } } }) },
        responses: { 200: ok('Cita reprogramada'), 409: err('Franja ocupada o estado inválido') } },
    },
    '/api/citas/{id}/cancelar': { patch: { tags: ['Citas'], summary: 'Cancelar cita', security: seguro, parameters: [idParam], responses: { 200: ok('Cita cancelada'), 409: err('Estado inválido') } } },
    '/api/citas/{id}/atender': { patch: { tags: ['Citas'], summary: 'Marcar cita como atendida (médico)', security: seguro, parameters: [idParam], responses: { 200: ok('Cita atendida') } } },
    '/api/historias/paciente/{pacienteId}': {
      get: { tags: ['Historias clínicas'], summary: 'Consultar historia clínica (RF-03)', security: seguro,
        description: 'Paciente: solo la suya. Médico: solo pacientes con los que tenga citas. Administrador: sin acceso. Datos descifrados al responder.',
        parameters: [{ name: 'pacienteId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: ok('Historia y registros'), 403: err('No autorizado') } },
    },
    '/api/historias/paciente/{pacienteId}/registros': {
      post: { tags: ['Historias clínicas'], summary: 'Agregar registro clínico (solo médico autorizado)', security: seguro,
        description: 'Los registros son inmutables. Para corregir uno, crea otro con corrige_registro_id.',
        parameters: [{ name: 'pacienteId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: json({ type: 'object', required: ['diagnostico'],
          properties: { diagnostico: { type: 'string' }, tratamiento: { type: 'string' }, notas: { type: 'string' },
            cita_id: { type: 'integer' }, corrige_registro_id: { type: 'integer' } } }) },
        responses: { 201: ok('Registro creado'), 403: err('No autorizado') } },
    },
    '/api/notificaciones': { get: { tags: ['Notificaciones'], summary: 'Notificaciones del usuario (RF-04)', security: seguro, responses: { 200: ok('Notificaciones') } } },
    '/api/reportes/resumen': { get: { tags: ['Reportes'], summary: 'Resumen consolidado (administrador)', security: seguro, responses: { 200: ok('Resumen') } } },
    '/api/reportes/auditoria': { get: { tags: ['Reportes'], summary: 'Registro de auditoría (administrador)', security: seguro, responses: { 200: ok('Eventos') } } },
  },
};
