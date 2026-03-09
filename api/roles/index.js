// api/roles/index.js — CRUD de grupos de permissão — v10.1.0
const { sql } = require('../../lib/db');
const { verifyToken } = require('../../lib/auth');
const { ALL_PERMISSIONS } = require('../../lib/permissions');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Autenticação
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const user = verifyToken(token);
  if (!user) return res.status(401).json({ error: 'Nao autenticado' });

  // Apenas quem tem grupos.gerenciar pode mexer nos grupos
  // GET é liberado para qualquer autenticado (para montar tela de usuários)
  if (req.method !== 'GET') {
    const perms = user.permissions || [];
    if (!perms.includes('grupos.gerenciar')) {
      return res.status(403).json({ error: 'Sem permissao para gerenciar grupos' });
    }
  }

  try {
    // ── GET — listar todos os grupos ──────────────────────────
    if (req.method === 'GET') {
      const roles = await sql`
        SELECT r.id, r.name, r.description, r.permissions, r.is_system, r.created_at,
               COUNT(ur.user_id)::int as user_count
        FROM roles r
        LEFT JOIN user_roles ur ON ur.role_id = r.id
        GROUP BY r.id
        ORDER BY r.is_system DESC, r.name
      `;
      return res.json(roles);
    }

    // ── POST — criar novo grupo ───────────────────────────────
    if (req.method === 'POST') {
      const { name, description, permissions } = req.body || {};
      if (!name?.trim()) return res.status(400).json({ error: 'Nome do grupo obrigatorio' });

      // Validar permissões enviadas
      const validPerms = (permissions || []).filter(p => ALL_PERMISSIONS.includes(p));

      const [created] = await sql`
        INSERT INTO roles (name, description, permissions, is_system, created_by)
        VALUES (
          ${name.trim()},
          ${description?.trim() || null},
          ${JSON.stringify(validPerms)}::jsonb,
          false,
          ${user.name}
        )
        RETURNING id, name, description, permissions, is_system, created_at
      `;
      return res.status(201).json(created);
    }

    // ── PUT — editar grupo ────────────────────────────────────
    if (req.method === 'PUT') {
      const { id, name, description, permissions } = req.body || {};
      if (!id) return res.status(400).json({ error: 'ID do grupo obrigatorio' });

      // Verificar se é sistema (não pode renomear grupos de sistema)
      const [existing] = await sql`SELECT is_system FROM roles WHERE id = ${id}`;
      if (!existing) return res.status(404).json({ error: 'Grupo nao encontrado' });

      const validPerms = (permissions || []).filter(p => ALL_PERMISSIONS.includes(p));

      // Grupos de sistema: só atualiza permissões, não o nome
      if (existing.is_system) {
        const [updated] = await sql`
          UPDATE roles SET
            description = ${description?.trim() || null},
            permissions = ${JSON.stringify(validPerms)}::jsonb
          WHERE id = ${id}
          RETURNING id, name, description, permissions, is_system
        `;
        return res.json(updated);
      }

      const [updated] = await sql`
        UPDATE roles SET
          name        = ${name?.trim() || existing.name},
          description = ${description?.trim() || null},
          permissions = ${JSON.stringify(validPerms)}::jsonb
        WHERE id = ${id}
        RETURNING id, name, description, permissions, is_system
      `;
      return res.json(updated);
    }

    // ── DELETE — excluir grupo ────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.body || req.query || {};
      if (!id) return res.status(400).json({ error: 'ID do grupo obrigatorio' });

      const [existing] = await sql`SELECT is_system, name FROM roles WHERE id = ${id}`;
      if (!existing) return res.status(404).json({ error: 'Grupo nao encontrado' });
      if (existing.is_system) return res.status(400).json({ error: 'Grupos do sistema nao podem ser excluidos' });

      // Verificar se há usuários nesse grupo
      const [{ count }] = await sql`SELECT COUNT(*)::int as count FROM user_roles WHERE role_id = ${id}`;
      if (count > 0) return res.status(400).json({
        error: `Grupo possui ${count} usuario(s). Remova-os antes de excluir.`
      });

      await sql`DELETE FROM roles WHERE id = ${id}`;
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('Roles API error:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
