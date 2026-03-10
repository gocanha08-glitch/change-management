// api/users/index.js — GET list, POST create, PUT update
const { sql } = require('../../lib/db');
const { requireAdmin, requireAuth } = require('../../lib/auth');
const bcrypt = require('bcryptjs');
const { validatePassword } = require('../../lib/passwordPolicy');

const CORS = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

module.exports = async (req, res) => {
  CORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — qualquer usuário autenticado
  if (req.method === 'GET') {
    const user = requireAuth(req, res);
    if (!user) return;
    try {
      const rows = await sql`
        SELECT id, name, email, area, role, eval_depts, active, created_at
        FROM users ORDER BY name
      `;
      return res.json(rows.map(u => ({
        id: u.id, name: u.name, email: u.email, area: u.area,
        role: u.role, evalDepts: u.eval_depts || [], active: u.active,
        createdAt: u.created_at
      })));
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar usuarios' });
    }
  }

  // POST — criar usuário (admin only)
  if (req.method === 'POST') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const { name, email, area, role, pwd, evalDepts } = req.body || {};
    if (!name || !email || !pwd) return res.status(400).json({ error: 'Nome, email e senha obrigatorios' });

    // Validar política de senha
    const policyErr = validatePassword(pwd, { name, email });
    if (policyErr) return res.status(400).json({ error: policyErr });

    try {
      const hash = await bcrypt.hash(pwd, 12);
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

  // PUT — atualizar usuário (admin only)
  if (req.method === 'PUT') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const body = req.body || {};

    // Batch update (importação Excel)
    if (Array.isArray(body.users)) {
      try {
        for (const u of body.users) {
          if (u._new && u.pwd) {
            const pwdErr = validatePassword(u.pwd, { name: u.name, email: u.email });
            if (pwdErr) continue; // pula usuários com senha inválida na importação
            const hash = await bcrypt.hash(u.pwd, 12);
            await sql`
              INSERT INTO users (id, name, email, area, role, pwd_hash, eval_depts, active, created_by)
              VALUES (${u.id}, ${u.name}, ${u.email.toLowerCase()}, ${u.area||''}, ${u.role||'geral'}, ${hash}, ${JSON.stringify(u.evalDepts||[])}, ${u.active!==false}, ${admin.name})
              ON CONFLICT (email) DO NOTHING
            `;
          } else {
            // Atualizar dados (sem senha)
            if (u._np) {
              const pwdErr = validatePassword(u._np, { name: u.name, email: u.email });
              if (pwdErr) return res.status(400).json({ error: `Usuario ${u.name}: ${pwdErr}` });

              // Buscar hash atual para histórico
              const cur = await sql`SELECT pwd_hash FROM users WHERE id = ${u.id} LIMIT 1`;
              const hash = await bcrypt.hash(u._np, 12);

              // Verificar reutilização
              if (cur[0]) {
                const same = await bcrypt.compare(u._np, cur[0].pwd_hash);
                if (same) return res.status(400).json({ error: `Usuario ${u.name}: nova senha igual a atual` });
              }

              await sql`
                UPDATE users SET
                  name = ${u.name}, area = ${u.area||''}, role = ${u.role},
                  eval_depts = ${JSON.stringify(u.evalDepts||[])}, active = ${u.active!==false},
                  pwd_hash = ${hash}, pwd_hash_prev = ${cur[0]?.pwd_hash || null}
                WHERE id = ${u.id}
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
      // Salvar grupos se fornecidos
      if (groupIds !== undefined) {
        await sql`DELETE FROM user_roles WHERE user_id = ${id}`;
        for (const gid of (groupIds || [])) {
          await sql`INSERT INTO user_roles (user_id, role_id) VALUES (${id}, ${gid}) ON CONFLICT DO NOTHING`;
        }
      }

      if (_np) {
        const pwdErr = validatePassword(_np, { name, email });
        if (pwdErr) return res.status(400).json({ error: pwdErr });

        // Buscar hash atual para verificar reutilização e guardar histórico
        const cur = await sql`SELECT pwd_hash, pwd_hash_prev FROM users WHERE id = ${id} LIMIT 1`;
        if (cur[0]) {
          const same = await bcrypt.compare(_np, cur[0].pwd_hash);
          if (same) return res.status(400).json({ error: 'A nova senha nao pode ser igual a senha atual' });

          if (cur[0].pwd_hash_prev) {
            const samePrev = await bcrypt.compare(_np, cur[0].pwd_hash_prev);
            if (samePrev) return res.status(400).json({ error: 'A nova senha nao pode ser igual a ultima senha utilizada' });
          }
        }

        const hash = await bcrypt.hash(_np, 12);
        await sql`
          UPDATE users SET
            name=${name}, email=${email.toLowerCase()}, area=${area||''},
            role=${role}, eval_depts=${JSON.stringify(evalDepts||[])}, active=${active!==false},
            pwd_hash=${hash}, pwd_hash_prev=${cur[0]?.pwd_hash || null}
          WHERE id=${id}
        `;
      } else {
        await sql`
          UPDATE users SET
            name=${name}, email=${email.toLowerCase()}, area=${area||''},
            role=${role}, eval_depts=${JSON.stringify(evalDepts||[])}, active=${active!==false}
          WHERE id=${id}
        `;
      }
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao atualizar usuario' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
