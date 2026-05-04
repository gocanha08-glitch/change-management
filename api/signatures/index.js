// api/signatures/index.js — GET assinaturas eletrônicas
const { sql } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');

const ALLOWED_ORIGINS = [
  'https://change-management-eta.vercel.app',
  'https://vydence-change.vercel.app',
  process.env.APP_URL,
].filter(Boolean);

const CORS = (req, res) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
};

module.exports = async (req, res) => {
  CORS(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT id, sa_id, signed_by_id, signed_by, action, action_detail, meaning, hash, ip_address, user_agent, signed_at
        FROM signatures
        ORDER BY signed_at DESC
      `;
      // Retorna no formato compatível com a tela de auditoria
      const formatted = rows.map(r => ({
        at: r.signed_at,
        by: r.signed_by,
        byId: r.signed_by_id,
        saId: r.sa_id,
        type: 'assinatura',
        event: r.action_detail,
        detail: r.meaning,
        hash: r.hash,
        ip: r.ip_address,
        action: r.action,
      }));
      return res.json(formatted);
    } catch (err) {
      console.error('GET signatures error:', err);
      return res.status(500).json({ error: 'Erro ao buscar assinaturas' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};