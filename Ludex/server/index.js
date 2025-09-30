// server/index.js (Opción A: static public + page routes)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { getPool } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const cookieParser = require('cookie-parser');
app.use(cookieParser());

// parse JSON
app.use(express.json());

// CORS (dev)
app.use(cors({
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500', 'http://localhost:3000'],
  credentials: true
}));

// Rutas de archivos públicos
const publicPath = path.join(__dirname, '..', 'src', 'public');       // contiene css/, html/, js/, img/, etc
const htmlPath = path.join(publicPath, 'html');                      // carpeta con los .html
const indexFile = path.join(htmlPath, 'index.html');

console.log('Serving publicPath =', publicPath);
console.log('index.html exists =', fs.existsSync(indexFile));
console.log('htmlPath =', htmlPath);

// Log básico de requests
app.use((req, res, next) => {
  console.log(`REQ --> ${req.method} ${req.url}`);
  next();
});

// Servir toda la carpeta public (permite acceder a /css/... /js/... /html/...)
app.use(express.static(publicPath));

// Rutas API (montar ANTES de las rutas tipo /:page para que /api/* no sea interceptado)
const authRouter = require('./routes/auth');
app.use(authRouter); // monta /api/auth/register y /api/auth/verify-email/:token

// Ruta de comprobación DB (API)
app.get('/test-db', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT TOP 5 * FROM INFORMATION_SCHEMA.TABLES');
    res.json({ ok: true, rows: result.recordset });
  } catch (err) {
    console.error('DB Error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Raíz -> servir index.html
app.get('/', (req, res) => {
  if (fs.existsSync(indexFile)) {
    console.log('HANDLER: serving index.html ->', indexFile);
    return res.sendFile(indexFile);
  }
  console.warn('HANDLER: index.html NO ENCONTRADO en', indexFile);
  return res.status(404).send('index.html no encontrado en ' + htmlPath);
});

// Opción A: servir /<page>.html desde src/public/html/<page>.html si existe
app.get('/:page.html', (req, res, next) => {
  const page = req.params.page;
  // bloquear rutas que empiezan por 'api' por seguridad (aunque authRouter ya montado)
  if (!page || page.toLowerCase().startsWith('api')) return next();

  const filePath = path.join(htmlPath, `${page}.html`);
  if (fs.existsSync(filePath)) {
    console.log(`PAGE ROUTE: serving ${filePath} for /${page}.html`);
    return res.sendFile(filePath);
  }
  console.log(`PAGE ROUTE: not found ${filePath} for /${page}.html`);
  return next();
});

// También permitir /<page> -> buscar <page>.html en htmlPath
app.get('/:page', (req, res, next) => {
  const page = req.params.page;
  if (!page || page.toLowerCase().startsWith('api')) return next();

  const filePath = path.join(htmlPath, `${page}.html`);
  if (fs.existsSync(filePath)) {
    console.log(`PAGE ROUTE: serving ${filePath} for /${page}`);
    return res.sendFile(filePath);
  }
  console.log(`PAGE ROUTE: not found ${filePath} for /${page}`);
  return next();
});

// Si llegamos aquí y nada respondió, devolver 404 simple
app.use((req, res) => {
  res.status(404).send('Recurso no encontrado');
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
