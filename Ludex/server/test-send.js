// server/test-send.js
require('dotenv').config();
const nodemailer = require('nodemailer');

(async () => {
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });

  try {
    await transporter.verify();
    console.log('VERIFY OK — enviando mail de prueba...');
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: 'tu_correo_de_prueba@ejemplo.com', // reemplaza por tu correo real
      subject: 'Prueba Ludex - envío real',
      html: '<p>Este es un correo de prueba enviado desde Ludex.</p>'
    });
    console.log('Enviado OK:', info && (info.response || info.messageId) );
  } catch (err) {
    console.error('Error enviando:', err && (err.message || err));
  }
  process.exit(0);
})();
