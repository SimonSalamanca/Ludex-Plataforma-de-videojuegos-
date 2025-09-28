// server/db.js (config explícita por host+puerto)
require('dotenv').config();
const sql = require('mssql');

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,    // 127.0.0.1
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '1433', 10),
  options: {
    encrypt: false,
    trustServerCertificate: true
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  connectionTimeout: 30000,
  requestTimeout: 30000
};

let poolPromise = null;
async function getPool() {
  if (!poolPromise) poolPromise = sql.connect(config);
  return poolPromise;
}
module.exports = { sql, getPool };
