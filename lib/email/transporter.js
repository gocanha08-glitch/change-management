// lib/email/transporter.js
// Usa Resend API com domínio resend.dev
// DEV_EMAIL redireciona todos os e-mails para um endereço de teste

async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn('[mailer] RESEND_API_KEY não configurada — e-mail não enviado');
    return null;
  }

  const from = 'CHANGE Management <onboarding@resend.dev>';
  
  // Se DEV_EMAIL estiver configurado, redireciona tudo para ele
  const devEmail = process.env.DEV_EMAIL;
  const toFinal = devEmail ? [devEmail] : (Array.isArray(to) ? to : [to]);

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

    console.log(`[mailer] Enviado: ${subject} → ${toFinal}`);
    return data;

  } catch (err) {
    console.error('[mailer] Erro:', err.message);
    return null;
  }
}

module.exports = { sendEmail };
