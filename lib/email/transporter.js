// lib/email/transporter.js
// Usa Resend API diretamente (sem SMTP)
// Em dev: usa domínio resend.dev (sem precisar verificar DNS)
// Em prod: usa domínio vydence.com (quando DNS estiver configurado)

async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn('[mailer] RESEND_API_KEY não configurada — e-mail não enviado');
    return null;
  }

  const isDev = process.env.NODE_ENV !== 'production';
  const from = isDev
    ? 'CHANGE Management <onboarding@resend.dev>'
    : `CHANGE Management <${process.env.EMAIL_FROM || 'noreply@vydence.com'}>`;

  // Em dev, força envio para o e-mail do dono da conta Resend
  // (resend.dev só entrega para o e-mail cadastrado na conta)
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
      body: JSON.stringify({
        from,
        to: toFinal,
        subject,
        html,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[mailer] Resend erro:', data);
      return null;
    }

    console.log(`[mailer] Enviado com sucesso: ${subject} → ${toFinal}`);
    return data;

  } catch (err) {
    console.error('[mailer] Erro ao chamar Resend API:', err.message);
    return null;
  }
}

module.exports = { sendEmail };
