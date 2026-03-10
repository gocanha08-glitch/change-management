// api/users/me.js — retorna dados atualizados do usuário logado incluindo grupos e permissions
const { sql } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const rows = await sql`
      SELECT id, name, email, area, role, eval_depts, active
      FROM users WHERE id = ${user.id} LIMIT 1
    `;
    const u = rows[0];
    if (!u) return res.status(404).json({ error: 'Usuario nao encontrado' });

    const roleRows = await sql`
      SELECT r.id, r.name, r.permissions
      FROM roles r
      JOIN user_roles ur ON ur.role_id = r.id
      WHERE ur.user_id = ${user.id}
      ORDER BY r.name
    `;
    const groups = roleRows.map(r => ({ id: r.id, name: r.name }));
    const groupIds = roleRows.map(r => r.id);
    const allPerms = roleRows.flatMap(r => Array.isArray(r.permissions) ? r.permissions : []);
    const permissions = [...new Set(allPerms)];

    return res.json({
      id: u.id, name: u.name, email: u.email, area: u.area,
      role: u.role, evalDepts: u.eval_depts || [], active: u.active,
      groups, groupIds, permissions
    });
  } catch (err) {
    console.error('GET /me error:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
