// api/users/index.js — GET list, POST create, PUT update
const { sql } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const { hasPermission } = require('../../lib/permissions');
const bcrypt = require('bcryptjs');

const CORS = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

module.exports = async (req, res) => {
  CORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;

  const perms = user.permissions || [];

  // GET — qualquer autenticado pode listar (para dropdowns de atribuição)
  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT id, name, email, area, role, eval_depts, active, created_at
        FROM users ORDER BY name
      `;
      const userRoleRows = await sql`
        SELECT ur.user_id, r.id, r.name, r.permissions
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        ORDER BY r.name
      `;
      const groupsByUser = {};
      const permsByUser = {};
      for (const ur of userRoleRows) {
        if (!groupsByUser[ur.user_id]) groupsByUser[ur.user_id] = [];
        if (!permsByUser[ur.user_id]) permsByUser[ur.user_id] = new Set();
        groupsByUser[ur.user_id].push({ id: ur.id, name: ur.name });
        (Array.isArray(ur.permissions) ? ur.permissions : []).forEach(p => permsByUser[ur.user_id].add(p));
      }
      return res.json(rows.map(u => ({
        id: u.id, name: u.name, email: u.email, area: u.area,
        role: u.role, evalDepts: u.eval_depts || [], active: u.active,
        createdAt: u.created_at,
        groups: groupsByUser[u.id] || [],
        groupIds: (groupsByUser[u.id] || []).map(g => g.id),
        permissions: [...(permsByUser[u.id] || [])]
      })));
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar usuarios' });
    }
  }

  // POST — criar usuário: requer usuarios.gerenciar
  if (req.method === 'POST') {
    if (!hasPermission(perms, 'usuarios.gerenciar')) {
      return res.status(403).json({ error: 'Sem permissão para criar usuários' });
    }
    const { name, email, area, role, pwd, evalDepts, groupIds } = req.body || {};
    if (!name || !email || !pwd) return res.status(400).json({ error: 'Nome, email e senha obrigatorios' });
    try {
      const hash = await bcrypt.hash(pwd, 10);
      const [created] = await sql`
        INSERT INTO users (name, email, area, role, pwd_hash, eval_depts, active, created_by)
        VALUES (${name}, ${email.toLowerCase()}, ${area||''}, ${role||'geral'}, ${hash}, ${JSON.stringify(evalDepts||[])}, true, ${user.name})
        RETURNING id, name, email, area, role, eval_depts, active
      `;
      // Atribuir grupos se informados
      if (Array.isArray(groupIds) && groupIds.length > 0) {
        for (const gid of groupIds) {
          await sql`INSERT INTO user_roles (user_id, role_id) VALUES (${created.id}, ${gid}) ON CONFLICT DO NOTHING`;
        }
      }
      return res.status(201).json({ ok: true, user: created });
    } catch (err) {
      if (err.message?.includes('unique')) return res.status(409).json({ error: 'Email ja cadastrado' });
      console.error('POST user error:', err);
      return res.status(500).json({ error: 'Erro ao criar usuario' });
    }
  }

  // PUT — editar usuário: requer usuarios.gerenciar
  if (req.method === 'PUT') {
    if (!hasPermission(perms, 'usuarios.gerenciar')) {
      return res.status(403).json({ error: 'Sem permissão para editar usuários' });
    }
    const body = req.body || {};

    // Batch update (importação Excel)
    if (Array.isArray(body.users)) {
      try {
        for (const u of body.users) {
          if (u._new && u.pwd) {
            const hash = await bcrypt.hash(u.pwd, 10);
            await sql`
              INSERT INTO users (name, email, area, role, pwd_hash, eval_depts, active, created_by)
              VALUES (${u.name}, ${u.email.toLowerCase()}, ${u.area||''}, ${u.role||'geral'}, ${hash}, ${JSON.stringify(u.evalDepts||[])}, ${u.active!==false}, ${user.name})
              ON CONFLICT (email) DO NOTHING
            `;
          } else {
            await sql`
              UPDATE users SET
                name = ${u.name}, area = ${u.area||''}, role = ${u.role},
                eval_depts = ${JSON.stringify(u.evalDepts||[])}, active = ${u.active!==false}
              WHERE id = ${u.id}
            `;
          }
        }
        return res.json({ ok: true });
      } catch (err) {
        console.error('PUT batch error:', err);
        return res.status(500).json({ error: 'Erro ao atualizar usuarios' });
      }
    }

    // Single update
    const { id, name, email, area, role, evalDepts, active, _np, groupIds } = body;
    if (!id) return res.status(400).json({ error: 'ID obrigatorio' });
    try {
      if (_np) {
        const hash = await bcrypt.hash(_np, 10);
        await sql`UPDATE users SET name=${name}, email=${email.toLowerCase()}, area=${area||''}, role=${role}, eval_depts=${JSON.stringify(evalDepts||[])}, active=${active!==false}, pwd_hash=${hash} WHERE id=${id}`;
      } else {
        await sql`UPDATE users SET name=${name}, email=${email.toLowerCase()}, area=${area||''}, role=${role}, eval_depts=${JSON.stringify(evalDepts||[])}, active=${active!==false} WHERE id=${id}`;
      }
      if (Array.isArray(groupIds)) {
        await sql`DELETE FROM user_roles WHERE user_id = ${id}`;
        for (const gid of groupIds) {
          await sql`INSERT INTO user_roles (user_id, role_id) VALUES (${id}, ${gid}) ON CONFLICT DO NOTHING`;
        }
      }
      return res.json({ ok: true });
    } catch (err) {
      console.error('PUT user error:', err);
      return res.status(500).json({ error: 'Erro ao atualizar usuario' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
