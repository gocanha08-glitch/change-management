// api/auth/verify-password.js
// POST — verifica senha e registra assinatura eletrônica (GAMP 5)
// GET  — retorna auditoria de assinaturas (para tela Assinaturas)

const { verifyToken, requireAuth } = require('../../lib/auth');
const { hasPermission } = require('../../lib/permissions');
const { query } = require('../../lib/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // verifyToken recebe req (não string) — padrão do lib/auth.js do projeto
  const decoded = verifyToken(req);
  if (!decoded) return res.status(401).json({ error: 'Não autenticado' });

  // ── GET: listar assinaturas (auditoria) ──────────────────────────
  if (req.method === 'GET') {
    if (!hasPermission(decoded, 'auditoria.ver') && !hasPermission(decoded, 'sa.avaliacao_inicial')) {
      return res.status(403).json({ error: 'Sem permissão' });
    }
    const { sa_id, from, to, action, limit = 200 } = req.query;
    let sql = `SELECT id, sa_id, action, action_detail, signed_by, signed_at, ip_address, meaning, hash
               FROM signatures WHERE 1=1`;
    const params = [];
    if (sa_id)  { params.push(sa_id);  sql += ` AND sa_id = $${params.length}`; }
    if (from)   { params.push(from);   sql += ` AND signed_at >= $${params.length}`; }
    if (to)     { params.push(to + 'T23:59:59Z'); sql += ` AND signed_at <= $${params.length}`; }
    if (action) { params.push(action); sql += ` AND action = $${params.length}`; }
    sql += ` ORDER BY signed_at DESC LIMIT $${params.length + 1}`;
    params.push(Math.min(parseInt(limit) || 200, 500));
    const { rows } = await query(sql, params);
    return res.status(200).json(rows);
  }

  // ── POST: verificar senha e registrar assinatura ─────────────────
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { password, sa_id, action, action_detail, meaning } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Senha obrigatória' });

  const { rows } = await query(
    'SELECT id, name, email, password_hash FROM users WHERE id = $1 AND active = true',
    [decoded.id]
  );
  if (!rows.length) return res.status(401).json({ error: 'Usuário não encontrado' });

  const user = rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Senha incorreta' });

  // Timestamp server-side — nunca confia no cliente
  const signedAt = new Date().toISOString();
  const hashInput = `${sa_id || ''}|${action || ''}|${user.id}|${signedAt}`;
  const hash = crypto.createHash('sha256').update(hashInput).digest('hex');
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null;
  const ua = req.headers['user-agent'] || null;

  let signatureId = null;
  if (sa_id && action) {
    try {
      const ins = await query(
        `INSERT INTO signatures (sa_id, action, action_detail, signed_by_id, signed_by, signed_at, ip_address, user_agent, meaning, hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [sa_id, action, action_detail || null, user.id, user.name, signedAt, ip, ua, meaning || action, hash]
      );
      signatureId = ins.rows[0]?.id;
    } catch (err) {
      console.error('[verify-password] Erro ao gravar assinatura:', err.message);
    }
  }

  return res.status(200).json({
    ok: true,
    signature: {
      signatureId, signedById: user.id, signedByName: user.name,
      signedByEmail: user.email, signedAt, hash,
      action: action || null, saId: sa_id || null,
    }
  });
};
