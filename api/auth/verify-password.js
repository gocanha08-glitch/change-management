// api/auth/verify-password.js — verifica senha para assinatura eletrônica
const { sql } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const bcrypt = require('bcryptjs');

const CORS = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

module.exports = async (req, res) => {
  CORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  const { password, reason } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Senha obrigatória' });
  if (!reason)   return res.status(400).json({ error: 'Motivo da assinatura obrigatório' });

  try {
    const rows = await sql`
      SELECT pwd_hash FROM users WHERE id = ${user.id} AND active = true LIMIT 1
    `;

    if (!rows[0]) return res.status(401).json({ error: 'Usuário não encontrado' });

    const valid = await bcrypt.compare(password, rows[0].pwd_hash);
    if (!valid) return res.status(401).json({ error: 'Senha incorreta' });

    // Retorna dados da assinatura para o frontend registrar no log
    const signature = {
      signedBy: user.id,
      signedByName: user.name,
      signedAt: new Date().toISOString(),
      signatureReason: reason,
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown',
    };

    return res.json({ ok: true, signature });

  } catch (err) {
    console.error('verify-password error:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
