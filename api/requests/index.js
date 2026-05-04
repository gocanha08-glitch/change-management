// api/requests/index.js — GET list, POST create
const { sql } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const { hasPermission } = require('../../lib/permissions');
const mailer = require('../../lib/email/mailer');

// CORS restrito ao domínio da Vercel
const ALLOWED_ORIGINS = [
    'https://change-management-eta.vercel.app',
    'https://vydence-change.vercel.app',
    process.env.APP_URL,
  ].filter(Boolean);

const CORS = (req, res) => {
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin)) {
          res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Vary', 'Origin');
};

// Rate limiting simples em memória (por IP)
const rateLimitMap = new Map();
const RATE_LIMIT = 60;   // máximo de requisições
const RATE_WINDOW = 60 * 1000; // janela de 1 minuto em ms

const checkRateLimit = (req, res) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
        const now = Date.now();
        const entry = rateLimitMap.get(ip) || { count: 0, start: now };

    if (now - entry.start > RATE_WINDOW) {
          // janela expirou, reinicia
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

    // GET — listar SAs
    if (req.method === 'GET') {
          try {
                  const rows = await sql`SELECT data FROM requests ORDER BY created_at DESC`;
                  return res.json(rows.map(r => ({
                            ...r.data,
                            evaluations: r.data.evaluations || {},
                            actions: r.da
