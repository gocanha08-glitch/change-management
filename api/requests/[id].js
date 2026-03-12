// api/requests/[id].js — GET one, PUT update — v10.3.2
const { sql } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const { hasPermission } = require('../../lib/permissions');

const CORS = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

function isSGQ(perms) {
  return hasPermission(perms, 'sa.avaliacao_inicial');
}

function validateTransition(oldStatus, newStatus, user, sa) {
  const perms = user.permissions || [];
  const uid = parseInt(user.id);

  // Cancelamento — só SGQ
  if (newStatus === 'cancelada') {
    if (!hasPermission(perms, 'sa.cancelar')) return 'Sem permissão para cancelar SA';
    return null;
  }

  // Conclusão — só SGQ, só de execucao
  if (newStatus === 'concluida') {
    if (!hasPermission(perms, 'sa.concluir')) return 'Sem permissão para concluir SA';
    if (oldStatus !== 'execucao') return 'SA precisa estar em execução para ser concluída';
    return null;
  }

  // aberta → avaliacao_inicial ou avaliacao_areas — só SGQ
  if (oldStatus === 'aberta' && (newStatus === 'avaliacao_inicial' || newStatus === 'avaliacao_areas')) {
    if (!hasPermission(perms, 'sa.avaliacao_inicial')) return 'Sem permissão para realizar avaliação inicial';
    return null;
  }

  // avaliacao_inicial → avaliacao_areas — só SGQ
  if (oldStatus === 'avaliacao_inicial' && newStatus === 'avaliacao_areas') {
    if (!hasPermission(perms, 'sa.avaliacao_inicial')) return 'Sem permissão para enviar para avaliação de áreas';
    return null;
  }

  // avaliacao_areas → aprovacao_plano — vinculado em assignments OU SGQ
  if (oldStatus === 'avaliacao_areas' && newStatus === 'aprovacao_plano') {
    const assignments = sa.triage?.assignments || {};
    const isAssigned = Object.values(assignments).some(id => parseInt(id) === uid);
    if (!isAssigned && !isSGQ(perms)) return 'Sem vínculo com esta SA para avançar avaliação';
    return null;
  }

  // aprovacao_plano → montagem_plano — só SGQ
  if (oldStatus === 'aprovacao_plano' && newStatus === 'montagem_plano') {
    if (!hasPermission(perms, 'sa.aprovacao_plano')) return 'Sem permissão para aprovar plano de ação';
    return null;
  }

  // montagem_plano → execucao — só SGQ
  if (oldStatus === 'montagem_plano' && newStatus === 'execucao') {
    if (!hasPermission(perms, 'sa.aprovacao_plano')) return 'Sem permissão para aprovar plano de ação';
    return null;
  }

  // Reabertura retroativa — só SGQ
  const statusOrder = {
    aberta: 0, avaliacao_inicial: 1, avaliacao_areas: 2,
    aprovacao_plano: 3, montagem_plano: 4, execucao: 5, concluida: 6
  };
  if ((statusOrder[newStatus] || 0) < (statusOrder[oldStatus] || 0)) {
    if (!isSGQ(perms)) return 'Sem permissão para reabrir fase anterior';
    return null;
  }

  // Update sem mudança de status
  if (oldStatus === newStatus) {
    return validateSameStatusUpdate(oldStatus, user, sa, perms, uid);
  }

  return null;
}

function validateSameStatusUpdate(status, user, sa, perms, uid) {
  // SGQ pode tudo em qualquer fase
  if (isSGQ(perms)) return null;

  // avaliacao_inicial — só SGQ (já retornou acima)
  if (status === 'avaliacao_inicial') {
    return 'Sem permissão para editar avaliação inicial';
  }

  // avaliacao_areas / aprovacao_plano — vinculado em assignments OU SGQ
  if (status === 'avaliacao_areas' || status === 'aprovacao_plano') {
    const assignments = sa.triage?.assignments || {};
    const isAssigned = Object.values(assignments).some(id => parseInt(id) === uid);
    if (!isAssigned) return 'Sem vínculo com avaliação desta SA';
    return null;
  }

  // montagem_plano — planResponsible OU SGQ
  if (status === 'montagem_plano') {
    const isPlanResp = parseInt(sa.planResponsible) === uid;
    if (!isPlanResp) return 'Sem permissão para editar plano de ação';
    return null;
  }

  // execucao — SGQ já passou, aqui só chega usuário sem sa.avaliacao_inicial
  // A validação de ação individual (responsible) é feita no frontend
  // Backend permite update em execucao para qualquer autenticado
  return null;
}

module.exports = async (req, res) => {
  CORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'ID obrigatorio' });

  if (req.method === 'GET') {
    try {
      const rows = await sql`SELECT data FROM requests WHERE id = ${id} LIMIT 1`;
      if (!rows[0]) return res.status(404).json({ error: 'SA nao encontrada' });
      return res.json(rows[0].data);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar SA' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const newSA = req.body;
      if (!newSA) return res.status(400).json({ error: 'Dados invalidos' });

      const rows = await sql`SELECT data FROM requests WHERE id = ${id} LIMIT 1`;
      if (!rows[0]) return res.status(404).json({ error: 'SA nao encontrada' });

      const currentSA = rows[0].data;
      const oldStatus = currentSA.status || 'aberta';
      const newStatus = newSA.status || oldStatus;

      const err = validateTransition(oldStatus, newStatus, user, currentSA);
      if (err) return res.status(403).json({ error: err });

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
