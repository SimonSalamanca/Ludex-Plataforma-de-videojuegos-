// server/index.js
require('dotenv').config();
const express = require('express');
const { getPool } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/test-db', async (req, res) => {
  try {
    const pool = await getPool();
    // Consulta simple para comprobar conexión
    const result = await pool.request().query('SELECT TOP 5 * FROM INFORMATION_SCHEMA.TABLES');
    res.json({ ok: true, rows: result.recordset });
  } catch (err) {
    console.error('DB Error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('API Ludex: servidor levantado. Usa /test-db para comprobar la BD.');
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
