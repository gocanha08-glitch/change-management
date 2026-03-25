// api/auth/verify-password.js
// Verifica senha do usuário logado e registra assinatura eletrônica (GAMP 5 / 21 CFR Part 11)
// Timestamp é SEMPRE server-side — nunca confia no cliente

const { verifyToken } = require('../../lib/auth');
const { query } = require('../../lib/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  // Autenticar usuário via JWT
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Não autenticado' });

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }

  const { password, sa_id, action, action_detail, meaning } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Senha obrigatória' });

  // Buscar usuário e senha hash no banco
  const { rows } = await query(
    'SELECT id, name, email, password_hash FROM users WHERE id = $1 AND active = true',
    [decoded.id]
  );
  if (!rows.length) return res.status(401).json({ error: 'Usuário não encontrado' });

  const user = rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Senha incorreta' });

  // Timestamp server-side — imutável
  const signedAt = new Date().toISOString();

  // Hash de integridade: SHA256(sa_id + action + user_id + signedAt)
  const hashInput = `${sa_id || ''}|${action || ''}|${user.id}|${signedAt}`;
  const hash = crypto.createHash('sha256').update(hashInput).digest('hex');

  // IP e user-agent para rastreabilidade
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null;
  const ua = req.headers['user-agent'] || null;

  // Gravar na tabela dedicada de assinaturas
  let signatureId = null;
  if (sa_id && action) {
    try {
      const ins = await query(
        `INSERT INTO signatures (sa_id, action, action_detail, signed_by_id, signed_by, signed_at, ip_address, user_agent, meaning, hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          sa_id,
          action,
          action_detail || null,
          user.id,
          user.name,
          signedAt,
          ip,
          ua,
          meaning || action,
          hash,
        ]
      );
      signatureId = ins.rows[0]?.id;
    } catch (err) {
      console.error('[verify-password] Erro ao gravar assinatura:', err.message);
      // Não bloqueia — loga mas retorna a assinatura mesmo assim
    }
  }

  // Objeto de assinatura retornado ao frontend (apenas para exibição/log da SA)
  const signature = {
    signatureId,
    signedById: user.id,
    signedByName: user.name,
    signedByEmail: user.email,
    signedAt,   // server-side
    hash,
    action: action || null,
    saId: sa_id || null,
  };

  return res.status(200).json({ ok: true, signature });
};
