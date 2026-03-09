// api/auth/reset.js
const { sql } = require('../../lib/db');
const bcrypt = require('bcryptjs');
const { validatePassword } = require('../../lib/passwordPolicy');

const CORS = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

module.exports = async (req, res) => {
  CORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, pwd } = req.body || {};
  if (!token || !pwd) return res.status(400).json({ error: 'Token e senha obrigatorios' });

  try {
    const rows = await sql`
      SELECT id, name, email, pwd_hash, pwd_hash_prev
      FROM users
      WHERE reset_token = ${token}
      AND reset_expires > now()
      AND active = true
      LIMIT 1
    `;
    if (!rows.length) return res.status(400).json({ error: 'Token invalido ou expirado' });

    const user = rows[0];

    // Validar política de senha
    const policyErr = validatePassword(pwd, { name: user.name, email: user.email });
    if (policyErr) return res.status(400).json({ error: policyErr });

    // Proibir reutilização da senha atual
    const sameAsCurrent = await bcrypt.compare(pwd, user.pwd_hash);
    if (sameAsCurrent) return res.status(400).json({ error: 'A nova senha nao pode ser igual a senha atual' });

    // Proibir reutilização da senha anterior
    if (user.pwd_hash_prev) {
      const sameAsPrev = await bcrypt.compare(pwd, user.pwd_hash_prev);
      if (sameAsPrev) return res.status(400).json({ error: 'A nova senha nao pode ser igual a ultima senha utilizada' });
    }

    const hash = await bcrypt.hash(pwd, 12);

    await sql`
      UPDATE users SET
        pwd_hash = ${hash},
        pwd_hash_prev = ${user.pwd_hash},
        reset_token = null,
        reset_expires = null,
        login_attempts = 0,
        locked_until = null
      WHERE id = ${user.id}
    `;

    return res.json({ ok: true });

  } catch (err) {
    console.error('Reset error:', err);
    return res.status(500).json({ error: 'Erro ao redefinir senha' });
  }
};
