// lib/email/transporter.js
// Em dev/teste: usa Gmail com senha de app
// Em prod: usa Resend com domínio vydence.com (quando DNS estiver configurado)

const nodemailer = require('nodemailer');

let _transporter = null;

async function getTransporter() {
  if (_transporter) return _transporter;

  const useGmail = process.env.GMAIL_USER && process.env.GMAIL_PASS;

  if (useGmail) {
    _transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
    });
    console.log('[mailer] Usando Gmail como provedor');
  } else {
    // Fallback: Resend via API
    console.log('[mailer] Usando Resend como provedor');
  }

  return _transporter;
}

async function sendEmail({ to, subject, html }) {
  const useGmail = process.env.GMAIL_USER && process.env.GMAIL_PASS;

  if (useGmail) {
    try {
      const transporter = await getTransporter();
      const info = await transporter.sendMail({
        from: `CHANGE Management <${process.env.GMAIL_USER}>`,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        html,
      });
      console.log(`[mailer] Enviado via Gmail: ${subject} → ${to}`);
      return info;
    } catch (err) {
      console.error('[mailer] Erro Gmail:', err.message);
      return null;
    }
  }

  // Fallback Resend
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[mailer] Nenhum provedor configurado');
    return null;
  }

  const isDev = process.env.USE_DEV_EMAIL === 'true';
  const from = isDev
    ? 'CHANGE Management <onboarding@resend.dev>'
    : `CHANGE Management <${process.env.EMAIL_FROM || 'noreply@vydence.com'}>`;
  const toFinal = isDev
    ? (process.env.DEV_EMAIL || to)
    : (Array.isArray(to) ? to : [to]);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: toFinal, subject, html }),
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('[mailer] Resend erro:', data);
      return null;
    }
    console.log(`[mailer] Enviado via Resend: ${subject}`);
    return data;
  } catch (err) {
    console.error('[mailer] Erro Resend:', err.message);
    return null;
  }
}

module.exports = { sendEmail };
