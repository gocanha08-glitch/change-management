// api/auth/login.js
const { sql } = require('../../lib/db');
const { signToken } = require('../../lib/auth');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatorios' });

  try {
    const rows = await sql`
      SELECT id, name, email, area, role, pwd_hash, eval_depts, active
      FROM users WHERE email = ${email.toLowerCase().trim()} LIMIT 1
    `;
    const user = rows[0];
    if (!user || !user.active) return res.status(401).json({ error: 'Usuario nao encontrado ou inativo' });

    const valid = await bcrypt.compare(password, user.pwd_hash);
    if (!valid) return res.status(401).json({ error: 'Senha incorreta' });

    const token = signToken(user);
    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, area: user.area, role: user.role, evalDepts: user.eval_depts || [] }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
