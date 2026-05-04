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
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
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
        SELECT * FROM signatures ORDER BY signed_at DESC
      `;
      return res.json(rows);
    } catch (err) {
      console.error('GET signatures error:', err);
      return res.status(500).json({ error: 'Erro ao buscar assinaturas' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};