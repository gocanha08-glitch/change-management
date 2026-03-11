// api/requests/[id].js — GET one, PUT update
const { sql } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const { hasPermission } = require('../../lib/permissions');

const CORS = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function isSGQ(perms) {
  // SGQ = tem permissão de avaliação inicial (permissão exclusiva do grupo SGQ)
  return hasPermission(perms, 'sa.avaliacao_inicial');
}

// Valida a transição de status e as permissões necessárias
// Retorna null se ok, ou string de erro
function validateTransition(oldStatus, newStatus, user, sa) {
  const perms = user.permissions || [];
  const uid = parseInt(user.id);

  // Cancelamento — qualquer status → cancelada (só SGQ)
  if (newStatus === 'cancelada') {
    if (!hasPermission(perms, 'sa.cancelar')) {
      return 'Sem permissão para cancelar SA';
    }
    return null;
  }

  // Conclusão — execucao → concluida (só SGQ)
  if (newStatus === 'concluida') {
    if (!hasPermission(perms, 'sa.concluir')) {
      return 'Sem permissão para concluir SA';
    }
    if (oldStatus !== 'execucao') {
      return 'SA precisa estar em execução para ser concluída';
    }
    return null;
  }

  // aberta → avaliacao_inicial (SGQ realiza avaliação inicial)
  if (oldStatus === 'aberta' && newStatus === 'avaliacao_inicial') {
    if (!hasPermission(perms, 'sa.avaliacao_inicial')) {
      return 'Sem permissão para realizar avaliação inicial';
    }
    return null;
  }

  // avaliacao_inicial → avaliacao_areas (SGQ conclui avaliação inicial e envia para áreas)
  if (oldStatus === 'avaliacao_inicial' && newStatus === 'avaliacao_areas') {
    if (!hasPermission(perms, 'sa.avaliacao_inicial')) {
      return 'Sem permissão para enviar SA para avaliação de áreas';
    }
    return null;
  }

  // aberta → avaliacao_areas (SGQ faz avaliação inicial e envia direto)
  if (oldStatus === 'aberta' && newStatus === 'avaliacao_areas') {
    if (!hasPermission(perms, 'sa.avaliacao_inicial')) {
      return 'Sem permissão para realizar avaliação inicial';
    }
    return null;
  }

  // avaliacao_areas → aprovacao_plano (todas as áreas concluíram)
  // Quem pode: avaliador vinculado (assignments) ou SGQ
  if (oldStatus === 'avaliacao_areas' && newStatus === 'aprovacao_plano') {
    const assignments = sa.triage?.assignments || {};
    const isAssigned = Object.values(assignments).some(id => parseInt(id) === uid);
    if (!isAssigned && !isSGQ(perms)) {
      return 'Sem vínculo com esta SA para avançar avaliação';
    }
    return null;
  }

  // aprovacao_plano → montagem_plano (SGQ aprova avaliações)
  if (oldStatus === 'aprovacao_plano' && newStatus === 'montagem_plano') {
    if (!hasPermission(perms, 'sa.aprovacao_plano')) {
      return 'Sem permissão para aprovar plano de ação';
    }
    return null;
  }

  // montagem_plano → execucao (SGQ aprova plano montado)
  if (oldStatus === 'montagem_plano' && newStatus === 'execucao') {
    if (!hasPermission(perms, 'sa.aprovacao_plano')) {
      return 'Sem permissão para aprovar plano de ação';
    }
    return null;
  }

  // Reabertura de fase (reopen) — só SGQ
  const reopenTransitions = [
    'aberta', 'avaliacao_areas', 'aprovacao_plano', 'montagem_plano', 'execucao'
  ];
  if (reopenTransitions.includes(newStatus) && oldStatus !== newStatus) {
    // Transições retroativas (reopen) — só SGQ
    const statusOrder = {
      aberta: 0, avaliacao_inicial: 1, avaliacao_areas: 2,
      aprovacao_plano: 3, montagem_plano: 4, execucao: 5, concluida: 6
    };
    if ((statusOrder[newStatus] || 0) < (statusOrder[oldStatus] || 0)) {
      if (!isSGQ(perms)) {
        return 'Sem permissão para reabrir fase anterior';
      }
      return null;
    }
  }

  // Status igual (update de dados sem mudar status) — validar por fase
  if (oldStatus === newStatus) {
    return validateSameStatusUpdate(oldStatus, user, sa, perms, uid);
  }

  return null; // transição não mapeada — permite (log será registrado pelo frontend)
}

// Validações para updates sem mudança de status
function validateSameStatusUpdate(status, user, sa, perms, uid) {
  // Avaliação inicial — só SGQ
  if (status === 'avaliacao_inicial') {
    if (!hasPermission(perms, 'sa.avaliacao_inicial')) {
      return 'Sem permissão para editar avaliação inicial';
    }
    return null;
  }

  // Avaliação de área — só quem está em assignments ou SGQ
  if (status === 'avaliacao_areas' || status === 'aprovacao_plano') {
    const assignments = sa.triage?.assignments || {};
    const isAssigned = Object.values(assignments).some(id => parseInt(id) === uid);
    if (!isAssigned && !isSGQ(perms)) {
      return 'Sem vínculo com avaliação desta SA';
    }
    return null;
  }

  // Montagem do plano — planResponsible ou SGQ
  if (status === 'montagem_plano') {
    const isPlanResp = parseInt(sa.planResponsible) === uid;
    if (!isPlanResp && !isSGQ(perms)) {
      return 'Sem permissão para editar plano de ação';
    }
    return null;
  }

  // Execução — ações são validadas individualmente no frontend
  // O backend não bloqueia update em execucao (avaliação de ações individuais é no frontend)
  return null;
}

// ─── handler ──────────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  CORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'ID obrigatorio' });

  // GET — buscar SA
  if (req.method === 'GET') {
    try {
      const rows = await sql`SELECT data FROM requests WHERE id = ${id} LIMIT 1`;
      if (!rows[0]) return res.status(404).json({ error: 'SA nao encontrada' });
      return res.json(rows[0].data);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar SA' });
    }
  }

  // PUT — atualizar SA
  if (req.method === 'PUT') {
    try {
      const newSA = req.body;
      if (!newSA) return res.status(400).json({ error: 'Dados invalidos' });

      // Buscar estado atual do banco
      const rows = await sql`SELECT data FROM requests WHERE id = ${id} LIMIT 1`;
      if (!rows[0]) return res.status(404).json({ error: 'SA nao encontrada' });

      const currentSA = rows[0].data;
      const oldStatus = currentSA.status || 'aberta';
      const newStatus = newSA.status || oldStatus;

      // Validar transição/permissão
      const err = validateTransition(oldStatus, newStatus, user, currentSA);
      if (err) return res.status(403).json({ error: err });

      // Salvar
      await sql`
        UPDATE requests
        SET data = ${JSON.stringify(newSA)},
            status = ${newStatus},
            updated_at = now()
        WHERE id = ${id}
      `;
      return res.json({ ok: true });
    } catch (err) {
      console.error('PUT request error:', err);
      return res.status(500).json({ error: 'Erro ao atualizar SA' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
