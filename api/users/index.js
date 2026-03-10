// api/users/index.js — GET list, POST create, PUT update batch
const { sql } = require('../../lib/db');
const { requireAdmin, requireAuth } = require('../../lib/auth');
const bcrypt = require('bcryptjs');

const CORS = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

module.exports = async (req, res) => {
  CORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — any authenticated user can fetch user list (for assignment dropdowns)
  if (req.method === 'GET') {
    const user = requireAuth(req, res);
    if (!user) return;
    try {
      const rows = await sql`
        SELECT id, name, email, area, role, eval_depts, active, created_at
        FROM users ORDER BY name
      `;
      // Buscar grupos de todos os usuários de uma vez
      const userRoleRows = await sql`
        SELECT ur.user_id, r.id, r.name, r.permissions
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        ORDER BY r.name
      `;
      // Agrupar por user_id
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

  // POST — create single user (admin only)
  if (req.method === 'POST') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const { name, email, area, role, pwd, evalDepts } = req.body || {};
    if (!name || !email || !pwd) return res.status(400).json({ error: 'Nome, email e senha obrigatorios' });

    try {
      const hash = await bcrypt.hash(pwd, 10);
      const rows = await sql`
        INSERT INTO users (name, email, area, role, pwd_hash, eval_depts, active, created_by)
        VALUES (${name}, ${email.toLowerCase()}, ${area||''}, ${role||'geral'}, ${hash}, ${JSON.stringify(evalDepts||[])}, true, ${admin.name})
        RETURNING id, name, email, area, role, eval_depts, active
      `;
      return res.status(201).json({ ok: true, user: rows[0] });
    } catch (err) {
      if (err.message?.includes('unique')) return res.status(409).json({ error: 'Email ja cadastrado' });
      console.error('POST user error:', err);
      return res.status(500).json({ error: 'Erro ao criar usuario' });
    }
  }

  // PUT — update single user or batch update
  if (req.method === 'PUT') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const body = req.body || {};

    // Batch update (from Excel import or full list save)
    if (Array.isArray(body.users) && body.users.length > 0 && !body.users.some(u => u._new)) {
      try {
        for (const u of body.users) {
          if (u._new && u.pwd) {
            const hash = await bcrypt.hash(u.pwd, 10);
            await sql`
              INSERT INTO users (id, name, email, area, role, pwd_hash, eval_depts, active, created_by)
              VALUES (${u.id}, ${u.name}, ${u.email.toLowerCase()}, ${u.area||''}, ${u.role||'geral'}, ${hash}, ${JSON.stringify(u.evalDepts||[])}, ${u.active!==false}, ${admin.name})
              ON CONFLICT (email) DO NOTHING
            `;
          } else {
            const updates = { name: u.name, area: u.area||'', role: u.role, eval_depts: JSON.stringify(u.evalDepts||[]), active: u.active!==false };
            if (u._np) updates.pwd_hash = await bcrypt.hash(u._np, 10);
            await sql`
              UPDATE users SET
                name = ${updates.name},
                area = ${updates.area},
                role = ${updates.role},
                eval_depts = ${updates.eval_depts},
                active = ${updates.active}
              WHERE id = ${u.id}
            `;
          }
        }
        return res.json({ ok: true });
      } catch (err) {
        console.error('PUT batch users error:', err);
        return res.status(500).json({ error: 'Erro ao atualizar usuarios' });
      }
    }

    // Single user update
    const { id, name, email, area, role, evalDepts, active, _np, groupIds } = body;
    if (!id) return res.status(400).json({ error: 'ID obrigatorio' });
    try {
      if (_np) {
        const hash = await bcrypt.hash(_np, 10);
        await sql`UPDATE users SET name=${name}, email=${email.toLowerCase()}, area=${area||''}, role=${role}, eval_depts=${JSON.stringify(evalDepts||[])}, active=${active!==false}, pwd_hash=${hash} WHERE id=${id}`;
      } else {
        await sql`UPDATE users SET name=${name}, email=${email.toLowerCase()}, area=${area||''}, role=${role}, eval_depts=${JSON.stringify(evalDepts||[])}, active=${active!==false} WHERE id=${id}`;
      }
      // Atualizar grupos (user_roles) se groupIds foi enviado
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
