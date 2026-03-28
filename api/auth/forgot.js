// api/auth/forgot.js
const { sql } = require('../../lib/db');
const { sendResetPassword } = require('../../lib/email/mailer');
const crypto = require('crypto');

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
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000).toISOString();

    await sql`UPDATE users SET reset_token = ${token}, reset_expires = ${expires} WHERE id = ${user.id}`;

    await sendResetPassword({
      to: email,
      name: user.name,
      resetUrl: `https://change-management-eta.vercel.app/reset?token=${token}`
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('Forgot error:', err);
    return res.status(500).json({ error: 'Erro ao enviar email' });
  }
};
