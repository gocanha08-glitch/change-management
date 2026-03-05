// api/config/[key].js — GET and PUT config values
const { sql } = require('../../lib/db');
const { requireAuth, requireAdmin } = require('../../lib/auth');

const CORS = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

// Valid config keys
const ALLOWED_KEYS = ['matrix', 'crits', 'phasedl', 'deptq', 'syslog'];

module.exports = async (req, res) => {
  CORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { key } = req.query;
  if (!ALLOWED_KEYS.includes(key)) return res.status(400).json({ error: 'Chave invalida' });

  if (req.method === 'GET') {
    const user = requireAuth(req, res);
    if (!user) return;
    try {
      const rows = await sql`SELECT value FROM config WHERE key = ${key} LIMIT 1`;
      return res.json(rows[0] ? rows[0].value : null);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar config' });
    }
  }

  if (req.method === 'PUT') {
    // syslog append can be done by any authenticated user
    const user = key === 'syslog' ? requireAuth(req, res) : requireAdmin(req, res);
    if (!user) return;

    try {
      const value = req.body;

      if (key === 'syslog') {
        // syslog: append entries to DB table instead of overwriting
        const entries = Array.isArray(value) ? value : [value];
        for (const e of entries) {
          await sql`
            INSERT INTO syslog (at, by, type, event, detail)
            VALUES (${e.at || new Date().toISOString()}, ${e.by||''}, ${e.type||'sistema'}, ${e.event||''}, ${e.detail||''})
          `;
        }
        return res.json({ ok: true });
      }

      await sql`
        INSERT INTO config (key, value, updated_at, updated_by)
        VALUES (${key}, ${JSON.stringify(value)}, now(), ${user.name})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by
      `;
      return res.json({ ok: true });
    } catch (err) {
      console.error('PUT config error:', err);
      return res.status(500).json({ error: 'Erro ao salvar config' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
