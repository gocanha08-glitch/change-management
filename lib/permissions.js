// lib/permissions.js
// Helper centralizado para verificação de permissões do CHANGE v10.1.0

// Lista completa de permissões válidas do sistema
const ALL_PERMISSIONS = [
  // Telas
  'dashboard', 'changes', 'detail', 'acoes', 'indicators',
  'crits', 'perguntas', 'settings', 'matrix', 'users', 'log',
  // SA
  'sa.criar', 'sa.cancelar', 'sa.ver_todas', 'sa.anexar',
  // Triagem
  'triagem.executar', 'triagem.aprovar',
  // Avaliação
  'avaliacao.responder', 'avaliacao.revisar', 'avaliacao.reatribuir',
  // Plano
  'plano.montar', 'plano.aprovar', 'plano.atribuir_resp',
  // Execução
  'acao.concluir', 'acao.solicitar_ext',
  // Prazos
  'prazo.aprovar_ext', 'prazo.alterar_direto',
  // Configurações
  'config.criticidades', 'config.perguntas', 'config.matriz', 'config.prazos',
  // Usuários e grupos
  'usuarios.gerenciar', 'usuarios.importar', 'grupos.gerenciar',
  // Auditoria
  'auditoria.ver',
];

// Busca todas as permissões de um usuário (união de todos os grupos)
async function getUserPermissions(sql, userId) {
  const rows = await sql`
    SELECT DISTINCT jsonb_array_elements_text(r.permissions) as perm
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = ${userId}
  `;
  return rows.map(r => r.perm);
}

// Busca os grupos de um usuário
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

// Verifica se um usuário tem uma permissão específica
function hasPermission(permissions, perm) {
  return Array.isArray(permissions) && permissions.includes(perm);
}

// Middleware — verifica permissão específica na requisição
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
