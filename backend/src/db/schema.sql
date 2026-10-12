-- Esquema derivado del Diagrama Entidad-Relación y del Diccionario de Datos (Entrega 2)

CREATE TABLE IF NOT EXISTS roles (
  id      SERIAL PRIMARY KEY,
  nombre  VARCHAR(30) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS usuarios (
  id             SERIAL PRIMARY KEY,
  nombre         VARCHAR(80)  NOT NULL,
  apellido       VARCHAR(80)  NOT NULL,
  correo         VARCHAR(150) NOT NULL,
  password_hash  TEXT         NOT NULL,
  rol_id         INT          NOT NULL REFERENCES roles(id),
  activo         BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_correo ON usuarios (lower(correo));

CREATE TABLE IF NOT EXISTS especialidades (
  id      SERIAL PRIMARY KEY,
  nombre  VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS pacientes (
  id               SERIAL PRIMARY KEY,
  usuario_id       INT NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  documento        VARCHAR(20) NOT NULL UNIQUE,
  telefono         VARCHAR(20),
  direccion        VARCHAR(200),
  fecha_nacimiento DATE
);

CREATE TABLE IF NOT EXISTS medicos (
  id               SERIAL PRIMARY KEY,
  usuario_id       INT NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  especialidad_id  INT NOT NULL REFERENCES especialidades(id),
  registro_medico  VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS citas (
  id             SERIAL PRIMARY KEY,
  paciente_id    INT NOT NULL REFERENCES pacientes(id),
  medico_id      INT NOT NULL REFERENCES medicos(id),
  fecha          DATE NOT NULL,
  hora           TIME NOT NULL,
  motivo         VARCHAR(250),
  estado         VARCHAR(15) NOT NULL DEFAULT 'programada'
                 CHECK (estado IN ('programada','reprogramada','cancelada','atendida')),
  creada_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizada_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Criterio de aceptación: impedir reserva doble o sobreposición en una misma franja
CREATE UNIQUE INDEX IF NOT EXISTS ux_cita_medico_franja
  ON citas (medico_id, fecha, hora) WHERE estado <> 'cancelada';
CREATE UNIQUE INDEX IF NOT EXISTS ux_cita_paciente_franja
  ON citas (paciente_id, fecha, hora) WHERE estado <> 'cancelada';
CREATE INDEX IF NOT EXISTS ix_citas_fecha ON citas (fecha);
CREATE INDEX IF NOT EXISTS ix_citas_paciente ON citas (paciente_id);
CREATE INDEX IF NOT EXISTS ix_citas_medico ON citas (medico_id);

CREATE TABLE IF NOT EXISTS notificaciones (
  id          SERIAL PRIMARY KEY,
  cita_id     INT REFERENCES citas(id),
  usuario_id  INT NOT NULL REFERENCES usuarios(id),
  tipo        VARCHAR(10) NOT NULL CHECK (tipo IN ('email','sms')),
  mensaje     TEXT NOT NULL,
  estado      VARCHAR(12) NOT NULL DEFAULT 'pendiente'
              CHECK (estado IN ('pendiente','enviada','simulada','fallida')),
  creada_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_notif_usuario ON notificaciones (usuario_id);

CREATE TABLE IF NOT EXISTS historias_clinicas (
  id           SERIAL PRIMARY KEY,
  paciente_id  INT NOT NULL UNIQUE REFERENCES pacientes(id) ON DELETE CASCADE,
  creada_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cada actualización de la historia es un NUEVO registro (historial inmutable).
-- diagnostico, tratamiento y notas se guardan cifrados (AES-256-GCM) desde la aplicación.
CREATE TABLE IF NOT EXISTS registros_clinicos (
  id                    SERIAL PRIMARY KEY,
  historia_id           INT NOT NULL REFERENCES historias_clinicas(id),
  medico_id             INT NOT NULL REFERENCES medicos(id),
  cita_id               INT REFERENCES citas(id),
  diagnostico           TEXT NOT NULL,
  tratamiento           TEXT,
  notas                 TEXT,
  corrige_registro_id   INT REFERENCES registros_clinicos(id),
  fecha_registro        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_registros_historia ON registros_clinicos (historia_id);

CREATE TABLE IF NOT EXISTS auditoria (
  id          BIGSERIAL PRIMARY KEY,
  usuario_id  INT,
  accion      VARCHAR(60) NOT NULL,
  entidad     VARCHAR(40),
  entidad_id  INT,
  detalle     JSONB,
  ip          VARCHAR(60),
  fecha       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inmutabilidad: no se permite editar ni borrar registros clínicos ni auditoría
CREATE OR REPLACE FUNCTION bloquear_modificacion() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Registro inmutable: la operación % no está permitida en %', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_registros_inmutables ON registros_clinicos;
CREATE TRIGGER trg_registros_inmutables
  BEFORE UPDATE OR DELETE ON registros_clinicos
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion();

DROP TRIGGER IF EXISTS trg_auditoria_inmutable ON auditoria;
CREATE TRIGGER trg_auditoria_inmutable
  BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion();
