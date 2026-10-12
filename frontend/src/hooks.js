import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

// Consulta un endpoint y expone { data, loading, error, reload }.
// Si path es null/undefined o enabled es false, no consulta.
export function useFetch(path, token, { enabled = true } = {}) {
  const [estado, setEstado] = useState({ data: null, loading: Boolean(path) && enabled, error: '' });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path || !enabled || !token) return undefined;
    let activo = true;
    setEstado((e) => ({ ...e, loading: true, error: '' }));
    api(path, { token })
      .then((data) => activo && setEstado({ data, loading: false, error: '' }))
      .catch((err) => activo && setEstado({ data: null, loading: false, error: err.message }));
    return () => { activo = false; };
  }, [path, token, enabled, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...estado, reload };
}
