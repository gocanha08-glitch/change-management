// lib/email/transporter.js
// SMTP Microsoft 365 / Office365 via nodemailer
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.office365.com',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true, // STARTTLS na porta 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    ciphers: 'SSLv3',
    rejectUnauthorized: false,
  },
});

async function sendEmail({ to, subject, html }) {
  const user = process.env.SMTP_USER;
  if (!user || !process.env.SMTP_PASS) {
    console.warn('[mailer] SMTP_USER ou SMTP_PASS não configurados — e-mail não enviado');
    return null;
  }

  const from = `CHANGE Management <${user}>`;

  // Se DEV_EMAIL estiver configurado, redireciona tudo para ele
  const devEmail = process.env.DEV_EMAIL;
  const toFinal = devEmail ? devEmail : (Array.isArray(to) ? to.join(',') : to);

  try {
    const info = await transporter.sendMail({
      from,
      to: toFinal,
      subject,
      html,
    });
    console.log(`[mailer] Enviado: ${subject} → ${toFinal} (${info.messageId})`);
    return info;
  } catch (err) {
    console.error('[mailer] Erro SMTP:', err.message);
    return null;
  }
}

module.exports = { sendEmail };
