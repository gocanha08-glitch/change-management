// api/auth/verify-password.js
const { verifyToken } = require('../../lib/auth');
const { hasPermission } = require('../../lib/permissions');
const { sql } = require('../../lib/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

module.exports = async (req, res) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const decoded = verifyToken(req);
    if (!decoded) return res.status(401).json({ error: 'Não autenticado' });

    // ── GET: listar assinaturas (auditoria) ──────────────────────────
    if (req.method === 'GET') {
      if (!hasPermission(decoded, 'auditoria.ver') && !hasPermission(decoded, 'sa.avaliacao_inicial')) {
        return res.status(403).json({ error: 'Sem permissão' });
      }
      const { sa_id, from, to, action, limit = 200 } = req.query;
      const lim = Math.min(parseInt(limit) || 200, 500);

      let rows = await sql`
        SELECT id, sa_id, action, action_detail, signed_by, signed_at, ip_address, meaning, hash
        FROM signatures
        ORDER BY signed_at DESC
        LIMIT ${lim}
      `;

      if (sa_id)  rows = rows.filter(r => r.sa_id === sa_id);
      if (action) rows = rows.filter(r => r.action === action);
      if (from)   rows = rows.filter(r => new Date(r.signed_at) >= new Date(from));
      if (to)     rows = rows.filter(r => new Date(r.signed_at) <= new Date(to + 'T23:59:59Z'));

      return res.status(200).json(rows);
    }

    // ── POST: verificar senha e registrar assinatura ─────────────────
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

    const { password, sa_id, action, action_detail, meaning } = req.body || {};
    if (!password) return res.status(400).json({ error: 'Senha obrigatória' });

    const users = await sql`
      SELECT id, name, email, pwd_hash
      FROM users
      WHERE id = ${decoded.id} AND active = true
    `;
    if (!users.length) return res.status(401).json({ error: 'Usuário não encontrado' });

    const user = users[0];
    const valid = await bcrypt.compare(password, user.pwd_hash);
    if (!valid) return res.status(401).json({ error: 'Senha incorreta' });

    const signedAt = new Date().toISOString();
    const hashInput = `${sa_id || ''}|${action || ''}|${user.id}|${signedAt}`;
    const hash = crypto.createHash('sha256').update(hashInput).digest('hex');
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null;
    const ua = req.headers['user-agent'] || null;

    let signatureId = null;
    if (sa_id && action) {
      try {
        const ins = await sql`
          INSERT INTO signatures
            (sa_id, action, action_detail, signed_by_id, signed_by, signed_at, ip_address, user_agent, meaning, hash)
          VALUES
            (${sa_id}, ${action}, ${action_detail || null}, ${user.id}, ${user.name},
             ${signedAt}, ${ip}, ${ua}, ${meaning || action}, ${hash})
          RETURNING id
        `;
        signatureId = ins[0]?.id;
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

  } catch (err) {
    console.error('[verify-password] ERRO GLOBAL:', err.message);
    return res.status(500).json({ error: 'Erro interno', detail: err.message });
  }
};
