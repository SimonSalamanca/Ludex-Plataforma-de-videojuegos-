// server/routes/auth.js
require('dotenv').config();
const express = require('express');
const router = express.Router();
const { getPool } = require('../db');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

// --- Helpers
function edadEnAnios(fechaNacimientoStr) {
  const nacimiento = new Date(fechaNacimientoStr);
  if (isNaN(nacimiento)) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const m = hoy.getMonth() - nacimiento.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) edad--;
  return edad;
}

function validarPassword(password) {
  if (typeof password !== 'string') return 'Password inválida';
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  if (!/[A-Z]/.test(password)) return 'La contraseña debe contener al menos una letra mayúscula';
  if (!/[a-z]/.test(password)) return 'La contraseña debe contener al menos una letra minúscula';
  if (!/[0-9]/.test(password)) return 'La contraseña debe contener al menos un número';
  if (!/[^A-Za-z0-9]/.test(password)) return 'La contraseña debe contener al menos un carácter especial';
  return null;
}

// --- Nodemailer transport (usa .env)
const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: smtpPort,
  secure: smtpPort === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Verificar transporte (solo log)
transporter.verify()
  .then(() => console.log('SMTP conectado OK'))
  .catch(err => console.warn('Advertencia: no se pudo verificar SMTP:', err && err.message ? err.message : err));

// -------------------------------
// POST /api/auth/register
// -------------------------------
router.post('/api/auth/register', async (req, res) => {
  try {
    console.log('DEBUG register body:', JSON.stringify(req.body));

    // Normalizar inputs
    const raw = req.body || {};
    const usuario = raw.usuario ? String(raw.usuario).trim() : '';
    const correo_electronico = raw.correo_electronico ? String(raw.correo_electronico).trim() : '';
    const password = raw.password ? String(raw.password) : '';
    const confirm_password = raw.confirm_password ? String(raw.confirm_password) : '';
    const nombre_completo = raw.nombre_completo ? String(raw.nombre_completo).trim() : '';
    const fecha_nacimiento = raw.fecha_nacimiento ? String(raw.fecha_nacimiento).trim() : '';
    const telefono = raw.telefono ? String(raw.telefono).trim() : null;
    const pais_id = raw.pais_id !== undefined && raw.pais_id !== null && String(raw.pais_id).trim() !== '' ? raw.pais_id : null;
    const acepto_terminos = raw.acepto_terminos ? true : false;

    // Validaciones básicas
    if (!usuario || !correo_electronico || !password || !confirm_password || !nombre_completo || !fecha_nacimiento) {
      return res.status(400).json({ ok: false, error: 'Faltan campos obligatorios' });
    }
    if (password !== confirm_password) {
      return res.status(400).json({ ok: false, error: 'Las contraseñas no coinciden' });
    }
    const pwdError = validarPassword(password);
    if (pwdError) return res.status(400).json({ ok: false, error: pwdError });

    const edad = edadEnAnios(fecha_nacimiento);
    if (edad === null) return res.status(400).json({ ok: false, error: 'Fecha de nacimiento inválida' });
    if (edad < 13) return res.status(400).json({ ok: false, error: 'Debes ser mayor o igual a 13 años para registrarte' });

    // Conexión DB
    const pool = await getPool();

    // Validar pais_id si fue enviado
    let paisIdValidated = null;
    if (pais_id !== null) {
      const parsed = Number(pais_id);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return res.status(400).json({ ok: false, error: 'país no válido (pais_id debe ser un entero positivo)' });
      }
      // verificar existencia en tabla paises
      const paisCheck = await pool.request()
        .input('paisId', parsed)
        .query('SELECT TOP 1 id, nombre FROM dbo.paises WHERE id = @paisId');

      if (paisCheck.recordset.length === 0) {
        return res.status(400).json({ ok: false, error: 'país no válido (pais_id no existe). Selecciona un país válido.' });
      } else {
        paisIdValidated = parsed;
      }
    }

    // Verificar unicidad correo / usuario
    const checkStmt = await pool.request()
      .input('email', correo_electronico)
      .input('usuario', usuario)
      .query(`SELECT TOP 1 id, correo_electronico, usuario FROM dbo.usuarios WHERE correo_electronico = @email OR usuario = @usuario`);
    if (checkStmt.recordset.length) {
      const existing = checkStmt.recordset[0];
      if (existing.correo_electronico === correo_electronico) return res.status(409).json({ ok: false, error: 'El correo ya está registrado' });
      if (existing.usuario === usuario) return res.status(409).json({ ok: false, error: 'El nombre de usuario ya está en uso' });
    }

    // Hashear contraseña
    const saltRounds = 10;
    const hash = await bcrypt.hash(password, saltRounds);

    // Insertar usuario con activo = 0
    const insertUser = await pool.request()
      .input('usuario', usuario)
      .input('correo', correo_electronico)
      .input('hash', hash)
      .input('nombre', nombre_completo)
      .input('telefono', telefono || null)
      .input('fecha_nacimiento', fecha_nacimiento)
      .input('pais_id', paisIdValidated) // validado arriba (int o null)
      .input('acepto_terminos', acepto_terminos ? 1 : 0)
      .query(`
        INSERT INTO dbo.usuarios
          ([usuario], [correo_electronico], [hash_contrasena], [nombre_completo], [telefono], [fecha_nacimiento], [pais_id], [acepto_terminos], [activo], [creado_en])
        OUTPUT INSERTED.id, INSERTED.usuario, INSERTED.correo_electronico
        VALUES (@usuario, @correo, @hash, @nombre, @telefono, @fecha_nacimiento, @pais_id, @acepto_terminos, 0, SYSUTCDATETIME());
      `);

    const newUser = insertUser.recordset[0];
    const userId = newUser.id;

    // Generar token y guardarlo
    const token = uuidv4();
    const expiracion = new Date(Date.now() + 24 * 3600 * 1000); // 24h

    await pool.request()
      .input('usuarioId', userId)
      .input('tipo', 'verify_email')
      .input('token', token)
      .input('exp', expiracion)
      .query(`
        INSERT INTO dbo.auth_tokens (usuario_id, tipo, token, expiracion, consumido, creado_en)
        VALUES (@usuarioId, @tipo, @token, @exp, 0, SYSUTCDATETIME());
      `);

    // Construir verifyUrl (forzar http en localhost para evitar errores SSL)
    let backendUrl = (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
    if (backendUrl.startsWith('https://localhost')) backendUrl = backendUrl.replace('https://', 'http://');
    const verifyUrl = `${backendUrl}/api/auth/verify-email/${token}`;

    // Enviar correo (html + text)
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: correo_electronico,
      subject: 'Verifica tu correo en Ludex',
      text: `Hola ${nombre_completo}, copia el siguiente enlace en tu navegador para verificar tu cuenta: ${verifyUrl}`,
      html: `
        <p>Hola ${nombre_completo},</p>
        <p>Gracias por registrarte en Ludex. Haz clic en el siguiente enlace para verificar tu correo y activar tu cuenta:</p>
        <p><a href="${verifyUrl}">${verifyUrl}</a></p>
        <p>Si no solicitaste este registro, ignora este correo.</p>
      `
    };

    transporter.sendMail(mailOptions)
      .then(info => console.log('Email de verificación enviado:', info && info.response ? info.response : info))
      .catch(err => console.error('Error enviando email de verificación:', err && err.message ? err.message : err));

    return res.status(201).json({ ok: true, message: 'Registro exitoso. Revisa tu correo para verificar la cuenta.' });

  } catch (err) {
    console.error('Register error: ', err);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// -------------------------------
// GET /api/auth/verify-email/:token
// - activa cuenta, marca token, crea JWT y setea cookie httpOnly
// -------------------------------
router.get('/api/auth/verify-email/:token', async (req, res) => {
  try {
    const token = req.params.token;
    if (!token) return res.status(400).json({ ok:false, error: 'Token requerido' });

    const pool = await getPool();

    // Buscar token (sea consumido o no)
    const tokenRow = await pool.request()
      .input('token', token)
      .query(`SELECT TOP 1 * FROM dbo.auth_tokens WHERE token = @token AND tipo = 'verify_email'`);

    // FRONTEND URL para redirección (forzar http en localhost)
    let frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    if (frontendUrl.startsWith('https://localhost')) frontendUrl = frontendUrl.replace('https://', 'http://');

    const redirectToBrowse = (qs = '') => {
      const url = `${frontendUrl}/html/browse.html${qs ? (qs.startsWith('?') ? qs : `?${qs}`) : ''}`;
      return res.redirect(302, url);
    };

    if (!tokenRow.recordset.length) {
      // Token no encontrado -> redirigir con indicador de error
      console.log('VERIFY: token no encontrado', token);
      return redirectToBrowse('verified=error');
    }

    const row = tokenRow.recordset[0];

    // Si token expiró
    if (row.expiracion && new Date(row.expiracion) < new Date()) {
      console.log('VERIFY: token expirado', token);
      return redirectToBrowse('verified=expired');
    }

    // Si token ya fue consumido
    if (row.consumido) {
      console.log('VERIFY: token ya consumido, userId=', row.usuario_id);

      // Comprobar si el usuario ya está activo
      const userCheck = await pool.request()
        .input('id', row.usuario_id)
        .query('SELECT id, activo FROM dbo.usuarios WHERE id = @id');

      if (userCheck.recordset.length && userCheck.recordset[0].activo) {
        // Generar JWT y setear cookie para iniciar sesión al usuario
        const jwtPayload = { userId: row.usuario_id };
        const jwtOptions = { expiresIn: process.env.JWT_EXPIRES_IN || '7d' };
        const jwtSecret = process.env.JWT_SECRET || 'reemplaza_esto_por_una_clave_segura';
        const sessionToken = jwt.sign(jwtPayload, jwtSecret, jwtOptions);

        const isProd = (process.env.NODE_ENV === 'production');
        const cookieOptions = {
          httpOnly: true,
          sameSite: 'lax',
          secure: isProd,
          path: '/',
          maxAge: (function() {
            const ei = process.env.JWT_EXPIRES_IN || '7d';
            if (ei.endsWith('d')) return parseInt(ei, 10) * 24 * 60 * 60 * 1000;
            if (ei.endsWith('h')) return parseInt(ei, 10) * 60 * 60 * 1000;
            if (ei.endsWith('m')) return parseInt(ei, 10) * 60 * 1000;
            return 7 * 24 * 60 * 60 * 1000;
          })()
        };
        if (process.env.COOKIE_DOMAIN && process.env.COOKIE_DOMAIN !== 'localhost') cookieOptions.domain = process.env.COOKIE_DOMAIN;

        res.cookie('ludex_session', sessionToken, cookieOptions);
        return redirectToBrowse('verified=already');
      } else {
        // Token consumido pero usuario no activo? redirigir con error
        return redirectToBrowse('verified=error');
      }
    }

    // Token válido y no consumido -> proceder a activar usuario
    await pool.request().input('userId', row.usuario_id)
      .query(`UPDATE dbo.usuarios SET activo = 1, actualizado_en = SYSUTCDATETIME() WHERE id = @userId`);

    // Marcar token como consumido
    await pool.request().input('token', token)
      .query(`UPDATE dbo.auth_tokens SET consumido = 1 WHERE token = @token`);

    // Generar JWT y setear cookie (iniciar sesión)
    const jwtPayload = { userId: row.usuario_id };
    const jwtOptions = { expiresIn: process.env.JWT_EXPIRES_IN || '7d' };
    const jwtSecret = process.env.JWT_SECRET || 'reemplaza_esto_por_una_clave_segura';
    const sessionToken = jwt.sign(jwtPayload, jwtSecret, jwtOptions);

    const isProd = (process.env.NODE_ENV === 'production');
    const cookieOptions = {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      path: '/',
      maxAge: (function() {
        const ei = process.env.JWT_EXPIRES_IN || '7d';
        if (ei.endsWith('d')) return parseInt(ei, 10) * 24 * 60 * 60 * 1000;
        if (ei.endsWith('h')) return parseInt(ei, 10) * 60 * 60 * 1000;
        if (ei.endsWith('m')) return parseInt(ei, 10) * 60 * 1000;
        return 7 * 24 * 60 * 60 * 1000;
      })()
    };
    if (process.env.COOKIE_DOMAIN && process.env.COOKIE_DOMAIN !== 'localhost') cookieOptions.domain = process.env.COOKIE_DOMAIN;

    res.cookie('ludex_session', sessionToken, cookieOptions);

    // Redirigir al browse.html ya autenticado
    return redirectToBrowse();

  } catch (err) {
    console.error('Verify error: ', err);
    // En caso de error interno redirigir con flag (evitar exponer detalles)
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    return res.redirect(302, `${frontendUrl}/html/browse.html?verified=error`);
  }
});

// -------------------------------
// GET /api/auth/me
// -------------------------------
router.get('/api/auth/me', async (req, res) => {
  try {
    // cookie-parser debe estar habilitado en index.js
    const token = req.cookies && req.cookies.ludex_session ? req.cookies.ludex_session : null;
    if (!token) return res.status(401).json({ ok:false, error: 'No autenticado' });

    const jwtSecret = process.env.JWT_SECRET || 'reemplaza_esto_por_una_clave_segura';
    let payload;
    try {
      payload = jwt.verify(token, jwtSecret);
    } catch (e) {
      return res.status(401).json({ ok:false, error: 'Token inválido' });
    }

    const pool = await getPool();
    const userRow = await pool.request().input('id', payload.userId)
      .query('SELECT id, usuario, correo_electronico, nombre_completo, pais_id FROM dbo.usuarios WHERE id = @id');

    if (!userRow.recordset.length) return res.status(404).json({ ok:false, error: 'Usuario no encontrado' });
    const user = userRow.recordset[0];

    return res.json({ ok:true, user: { id: user.id, usuario: user.usuario, correo_electronico: user.correo_electronico, nombre_completo: user.nombre_completo, pais_id: user.pais_id } });
  } catch (err) {
    console.error('ME error: ', err);
    return res.status(401).json({ ok:false, error: 'No autenticado' });
  }
});

// -------------------------------
// POST /api/auth/logout
// -------------------------------
router.post('/api/auth/logout', (req, res) => {
  try {
    const isProd = (process.env.NODE_ENV === 'production');
    res.clearCookie('ludex_session', { httpOnly: true, sameSite: 'lax', secure: isProd });
    return res.json({ ok:true, message: 'Sesión cerrada' });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ ok:false, error: 'Error interno' });
  }
});

module.exports = router;
