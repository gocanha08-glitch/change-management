// api/users/[id]/roles.js — retorna grupos de um usuário
const { sql } = require('../../../lib/db');
const { verifyToken } = require('../../../lib/auth');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Nao autenticado' });

  const { id } = req.query;
  try {
    const roles = await sql`
      SELECT r.id, r.name, r.description
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ${id}
      ORDER BY r.name
    `;
    return res.json(roles);
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno' });
  }
};
