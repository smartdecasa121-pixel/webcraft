// ============================================================
// server.js - Backend de WebCraft.
//
// Qué hace:
//   - POST /api/register   -> crea un usuario nuevo (usuario+contraseña)
//   - POST /api/login       -> valida usuario+contraseña, devuelve un token
//   - GET  /api/save         -> devuelve la partida guardada del usuario logueado
//   - POST /api/save          -> guarda/actualiza la partida del usuario logueado
//
// Las contraseñas NUNCA se guardan en texto plano: se guardan
// "hasheadas" con bcrypt (una función que las vuelve irreversibles).
// La sesión se maneja con un token simple guardado en la base,
// que el frontend manda en el header "Authorization: Bearer <token>".
// ============================================================
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
app.use(cors()); // permite que el frontend (otro dominio) llame a esta API
app.use(express.json());

// ---------- Conexión a PostgreSQL ----------
// Render nos da la cadena de conexión en la variable de entorno DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

// Crea las tablas si todavía no existen (se corre una sola vez al arrancar)
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      token TEXT,
      created_at TIMESTAMP DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS saves (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMP DEFAULT now()
    );
  `);
  console.log('Base de datos lista (tablas users/saves verificadas).');
}

// ---------- Validaciones simples ----------
function isValidUsername(u) {
  return typeof u === 'string' && /^[a-zA-Z0-9_]{3,20}$/.test(u);
}
function isValidPassword(p) {
  return typeof p === 'string' && p.length >= 4 && p.length <= 64;
}

// ---------- Middleware de autenticación ----------
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Falta iniciar sesión' });

  const result = await pool.query('SELECT id, username FROM users WHERE token = $1', [token]);
  if (result.rows.length === 0) return res.status(401).json({ error: 'Sesión inválida, iniciá sesión de nuevo' });

  req.user = result.rows[0];
  next();
}

// ---------- Rutas ----------
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'webcraft-server' });
});

app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!isValidUsername(username)) {
      return res.status(400).json({ error: 'El usuario debe tener 3-20 caracteres (letras, números o _)' });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Ese usuario ya existe, probá con otro nombre' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const token = crypto.randomUUID();

    const inserted = await pool.query(
      'INSERT INTO users (username, password_hash, token) VALUES ($1, $2, $3) RETURNING id',
      [username, passwordHash, token]
    );
    const userId = inserted.rows[0].id;
    await pool.query('INSERT INTO saves (user_id, data) VALUES ($1, $2)', [userId, {}]);

    res.json({ token, username });
  } catch (err) {
    console.error('Error en /api/register:', err);
    res.status(500).json({ error: 'Error del servidor, intentá de nuevo' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!isValidUsername(username) || !isValidPassword(password)) {
      return res.status(400).json({ error: 'Usuario o contraseña inválidos' });
    }

    const result = await pool.query('SELECT id, password_hash FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const token = crypto.randomUUID();
    await pool.query('UPDATE users SET token = $1 WHERE id = $2', [token, user.id]);

    res.json({ token, username });
  } catch (err) {
    console.error('Error en /api/login:', err);
    res.status(500).json({ error: 'Error del servidor, intentá de nuevo' });
  }
});

app.get('/api/save', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT data FROM saves WHERE user_id = $1', [req.user.id]);
    const data = result.rows[0]?.data || {};
    const hasSave = data && Object.keys(data).length > 0;
    res.json({ save: hasSave ? data : null });
  } catch (err) {
    console.error('Error en GET /api/save:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/save', requireAuth, async (req, res) => {
  try {
    const { data } = req.body || {};
    if (typeof data !== 'object' || data === null) {
      return res.status(400).json({ error: 'Datos de guardado inválidos' });
    }
    await pool.query(
      `INSERT INTO saves (user_id, data, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET data = $2, updated_at = now()`,
      [req.user.id, data]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en POST /api/save:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ---------- Arranque ----------
const PORT = process.env.PORT || 3000;
initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`WebCraft server escuchando en el puerto ${PORT}`));
  })
  .catch((err) => {
    console.error('No se pudo inicializar la base de datos:', err);
    process.exit(1);
  });
