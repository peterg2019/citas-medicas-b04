import { Router } from 'express';
import { query } from '../db/pool.js';
import { autenticar } from '../middleware/auth.js';

const router = Router();
router.use(autenticar);

// RF-04: bandeja de notificaciones del usuario autenticado
router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT id, cita_id, tipo, mensaje, estado, creada_en FROM notificaciones
     WHERE usuario_id = $1 ORDER BY creada_en DESC, id DESC LIMIT 50`, [req.user.id]);
  res.json({ notificaciones: rows });
});

export default router;
