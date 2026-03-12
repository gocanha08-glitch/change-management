// lib/permissions.js — v10.3.1
const ALL_PERMISSIONS = [
  // Telas
  'dashboard', 'changes', 'detail', 'acoes', 'indicators',
  'crits', 'perguntas', 'settings', 'matrix', 'users', 'log',
  // Solicitações de Alteração
  'sa.criar',
  'sa.ver_todas',
  'sa.avaliacao_inicial',   // SGQ: realizar avaliação inicial + editar triagem
  'sa.aprovacao_plano',     // SGQ: aprovar plano de ação + iniciar execução
  'sa.concluir',            // SGQ: concluir SA
  'sa.cancelar',            // SGQ: cancelar SA em qualquer fase
  // Configurações do sistema
  'config.criticidades',
  'config.perguntas',
  'config.matriz',
  'config.prazos',
  // Usuários e grupos
  'usuarios.gerenciar',     // criar, editar, desativar usuários e atribuir áreas
  'usuarios.importar',      // importar via Excel
  'grupos.ver',             // visualizar a tela de grupos
  'grupos.gerenciar',       // criar e editar grupos de permissão
  // Auditoria
  'auditoria.ver',
];

async function getUserPermissions(sql, userId) {
  const rows = await sql`
    SELECT DISTINCT jsonb_array_elements_text(r.permissions) as perm
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = ${userId}
  `;
  return rows.map(r => r.perm);
}

async function getUserRoles(sql, userId) {
  const rows = await sql`
    SELECT r.id, r.name, r.description, r.permissions, r.is_system
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = ${userId}
    ORDER BY r.name
  `;
  return rows;
}

function hasPermission(permissions, perm) {
  return Array.isArray(permissions) && permissions.includes(perm);
}

function requirePermission(perm) {
  return (req, res, next) => {
    const permissions = req.user?.permissions || [];
    if (!hasPermission(permissions, perm)) {
      return res.status(403).json({ error: `Sem permissão: ${perm}` });
    }
    next?.();
    return true;
  };
}

module.exports = { ALL_PERMISSIONS, getUserPermissions, getUserRoles, hasPermission, requirePermission };
