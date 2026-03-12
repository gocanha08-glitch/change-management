// api/users/me.js — GET perfil atualizado + PUT trocar própria senha — v10.3.5
const { sql } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;

  // ── GET — retorna dados atualizados do banco (permissões sempre frescas)
  if (req.method === 'GET') {
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
  }

  // ── PUT — trocar própria senha (qualquer usuário autenticado)
  if (req.method === 'PUT') {
    const { _curPwd, _np } = req.body || {};
    if (!_curPwd || !_np) return res.status(400).json({ error: 'Senha atual e nova senha obrigatorias' });

    try {
      const rows = await sql`SELECT pwd_hash FROM users WHERE id = ${user.id} LIMIT 1`;
      const u = rows[0];
      if (!u) return res.status(404).json({ error: 'Usuario nao encontrado' });

      // Verificar senha atual
      const valid = await bcrypt.compare(_curPwd, u.pwd_hash);
      if (!valid) return res.status(401).json({ error: 'Senha atual incorreta' });

      // Validar nova senha (mínimo 8 chars)
      if (_np.length < 8) return res.status(400).json({ error: 'Nova senha deve ter pelo menos 8 caracteres' });

      const hash = await bcrypt.hash(_np, 10);
      await sql`UPDATE users SET pwd_hash = ${hash} WHERE id = ${user.id}`;

      return res.json({ ok: true });
    } catch (err) {
      console.error('PUT /me error:', err);
      return res.status(500).json({ error: 'Erro interno' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
