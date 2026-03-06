

const { sql } = require('../../lib/db');
const { Resend } = require('resend');

const CORS = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

module.exports = async (req, res) => {
  CORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email obrigatorio' });

  try {
    const rows = await sql`SELECT id, name FROM users WHERE email = ${email.toLowerCase()} AND active = true LIMIT 1`;
    if (!rows.length) return res.json({ ok: true }); // não revela se email existe

    const user = rows[0];
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const expires = new Date(Date.now() + 3600000).toISOString(); // 1 hora

    await sql`UPDATE users SET reset_token = ${token}, reset_expires = ${expires} WHERE id = ${user.id}`;

    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: email,
      subject: 'Recuperacao de senha - CHANGE',
      html: `<p>Ola ${user.name},</p><p>Clique no link para redefinir sua senha:</p><p><a href="https://change-management-eta.vercel.app/reset?token=${token}">Redefinir senha</a></p><p>Este link expira em 1 hora.</p>`
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('Forgot error:', err);
    return res.status(500).json({ error: 'Erro ao enviar email' });
  }
};
