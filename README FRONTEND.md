# Frontend — Sistema de Citas Médicas

Frontend inicial en React + Vite para conectarse al backend Express del proyecto.

## Requisitos
- Node.js 20+
- Backend iniciado y conectado a Neon

## Ejecutar en desarrollo

```bash
npm install
cp .env.example .env
npm run dev
```

En Windows PowerShell, si necesitas copiar el ejemplo:

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Por defecto el frontend llama a `http://localhost:4000/api`. Si el backend está en otra dirección, cambia `VITE_API_URL` en `.env` y reinicia Vite.

## Crear versión de producción

```bash
npm run build
```

Vite genera `dist/`. Para servirlo desde el backend con el código actual, deja la carpeta `frontend` al mismo nivel que `backend`, de modo que quede `frontend/dist`, y compila el frontend. Alternativamente, despliega `dist/` en un hosting estático y configura `VITE_API_URL` con la URL pública de la API.

## Incluye
- Inicio de sesión conectado a `POST /api/auth/login`.
- Citas conectadas a `GET /api/citas`.
- Selector de médicos/especialidades.
- Formulario inicial de creación de citas (`POST /api/citas`).
- Historia clínica del paciente (`GET /api/historias/paciente/:pacienteId`).
- Vistas administrativas para usuarios y reportes.

## Importante antes de entregar
- Este frontend es un punto de partida funcional, no una certificación de producción.
- El formulario de registro público aún no está incluido.
- La disponibilidad se debe consultar con `GET /api/medicos/:id/disponibilidad?fecha=AAAA-MM-DD`; la lista de horas actual es solo una ayuda visual. El servidor valida la agenda real.
- La creación de citas como administrador requiere seleccionar un paciente (`paciente_id`); esa selección debe añadirse antes de habilitar ese flujo.
- El cierre de sesión elimina la sesión guardada en `sessionStorage`.
- No incluyas secretos ni contraseñas reales en el frontend. `VITE_API_URL` no es un secreto.
- En producción configura `JWT_SECRET`, `DATA_ENCRYPTION_KEY`, `DATABASE_URL`, `DATABASE_SSL` y `CORS_ORIGIN` con valores apropiados en el servidor.
