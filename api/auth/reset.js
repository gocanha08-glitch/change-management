


const { sql } = require('../../lib/db');
const bcrypt = require('bcryptjs');

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
      SELECT id FROM users 
      WHERE reset_token = ${token} 
      AND reset_expires > now() 
      AND active = true 
      LIMIT 1
    `;
    if (!rows.length) return res.status(400).json({ error: 'Token invalido ou expirado' });

    const hash = await bcrypt.hash(pwd, 10);
    await sql`
      UPDATE users SET pwd_hash = ${hash}, reset_token = null, reset_expires = null 
      WHERE id = ${rows[0].id}
    `;
    return res.json({ ok: true });
  } catch (err) {
    console.error('Reset error:', err);
    return res.status(500).json({ error: 'Erro ao redefinir senha' });
  }
};
