// api/requests/index.js — GET list, POST create
const { sql } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const { hasPermission } = require('../../lib/permissions');
const mailer = require('../../lib/email/mailer');

const CORS = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

const safeSA = (data) => ({
  ...data,
  evaluations: data.evaluations || {},
  actions: data.actions || [],
  attachments: data.attachments || [],
  deadlineExtensions: data.deadlineExtensions || [],
  log: data.log || [],
});

module.exports = async (req, res) => {
  CORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = requireAuth(req, res);
  if (!user) return;
  const perms = user.permissions || [];

  // GET — listar SAs
  if (req.method === 'GET') {
    try {
      const rows = await sql`SELECT data FROM requests ORDER BY created_at DESC`;
      return res.json(rows.map(r => safeSA(r.data)));
    } catch (err) {
      console.error('GET requests error:', err);
      return res.status(500).json({ error: 'Erro ao buscar SAs' });
    }
  }

  // POST — criar nova SA
  if (req.method === 'POST') {
    if (!hasPermission(perms, 'sa.criar')) {
      return res.status(403).json({ error: 'Sem permissão para criar SA' });
    }
    try {
      const sa = req.body;
      if (!sa || !sa.id) return res.status(400).json({ error: 'Dados invalidos' });
      if (!sa.title || !sa.title.trim()) return res.status(400).json({ error: 'Titulo obrigatorio' });
      if (!sa.description || !sa.description.trim()) return res.status(400).json({ error: 'Descricao obrigatoria' });
