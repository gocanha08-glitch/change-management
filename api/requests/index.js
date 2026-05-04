// api/requests/index.js — GET list, POST create
const { sql } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const { hasPermission } = require('../../lib/permissions');
const mailer = require('../../lib/email/mailer');

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
};

const rateLimitMap = new Map();
const RATE_LIMIT = 60;
const RATE_WINDOW = 60 * 1000;

const checkRateLimit = (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > RATE_WINDOW) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return false;
  }
  if (entry.count >= RATE_LIMIT) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'Muitas requisições. Tente novamente em 1 minuto.' });
    return true;
  }
  entry.count++;
  rateLimitMap.set(ip, entry);
  return false;
};

module.exports = async (req, res) => {
  CORS(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (checkRateLimit(req, res)) return;

  const user = requireAuth(req, res);
  if (!user) return;
  const perms = user.permissions || [];

  if (req.method === 'GET') {
    try {
      const rows = await sql`SELECT data FROM requests ORDER BY created_at DESC`;
      return res.json(rows.map(r => ({
        ...r.data,
        evaluations: r.data.evaluations || {},
        actions: r.data.actions || [],
        attachments: r.data.attachments || [],
        deadlineExtensions: r.data.deadlineExtensions || [],
        log: r.data.log || [],
      })));
    } catch (err) {
      console.error('GET requests error:', err);
      return res.status(500).json({ error: 'Erro ao buscar SAs' });
    }
  }

  if (req.method === 'POST') {
    if (!hasPermission(perms, 'sa.criar')) {
      return res.status(403).json({ error: 'Sem permissão para criar SA' });
    }
    try {
      const sa = req.body;
      if (!sa) return res.status(400).json({ error: 'Dados invalidos' });
      if (!sa.title || !sa.title.trim()) return res.status(400).json({ error: 'Titulo obrigatorio' });
      if (!sa.description || !sa.description.trim()) return res.status(400).json({ error: 'Descricao obrigatoria' });

      const [{ nextval }] = await sql`SELECT nextval('sa_id_seq') AS nextval`;
      const year = new Date().getFullYear();
      const num = String(nextval).padStart(3, '0');
      sa.id = `SA-${num}/${year}`;
      sa.status = 'aberta';
      sa.createdBy = user.id;

      const createdById = parseInt(user.id, 10);

      await sql`
        INSERT INTO requests (id, data, status, created_by, created_at, updated_at)
        VALUES (
          ${sa.id},
          ${JSON.stringify(sa)},
          'aberta',
          ${createdById},
          now(), now()
        )
      `;

      const sgqUsers = await sql`
        SELECT u.email FROM users u
        JOIN user_roles ur ON ur.user_id = u.id
        JOIN roles r ON r.id = ur.role_id
        WHERE r.name = 'SGQ' AND u.active = true
      `;
      const sgqEmails = sgqUsers.map(u => u.email);
      if (sgqEmails.length > 0) {
        const BASE_URL = process.env.APP_URL || 'https://change-management-eta.vercel.app';
        mailer.sendNewSA({
          to: sgqEmails,
          saId: sa.id,
          saTitle: sa.title,
          saType: sa.type,
          createdBy: sa.createdByName || user.name,
          saUrl: `${BASE_URL}/?view=detail&id=${encodeURIComponent(sa.id)}`
        });
      }
      return res.status(201).json({ ok: true, id: sa.id });
    } catch (err) {
      console.error('POST request error:', err);
      return res.status(500).json({ error: 'Erro ao criar SA', detail: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};