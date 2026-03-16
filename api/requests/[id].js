// api/requests/[id].js — GET one, PUT update
const { sql } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const { hasPermission } = require('../../lib/permissions');
const mailer = require('../../lib/email/mailer');

const CORS = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

const STATUS_ORDER = {
  aberta: 0, avaliacao_inicial: 1, avaliacao_areas: 2,
  montagem_plano: 3, aprovacao_plano: 4, execucao: 5,
  concluida: 6, cancelada: 7
};

const VALID_STATUSES = new Set(Object.keys(STATUS_ORDER));

function isSGQ(perms) {
  return hasPermission(perms, 'sa.avaliacao_inicial');
}

function validateTransition(oldStatus, newStatus, user, sa) {
  const perms = user.permissions || [];
  const uid = parseInt(user.id);

  if (!VALID_STATUSES.has(newStatus)) return `Status inválido: ${newStatus}`;

  if (oldStatus === 'concluida' || oldStatus === 'cancelada') {
    if (newStatus !== oldStatus) return `SA ${oldStatus} não pode ser alterada`;
  }

  if (oldStatus === newStatus) return validateSameStatusUpdate(oldStatus, user, sa, perms, uid);

  if (newStatus === 'cancelada') {
    if (!hasPermission(perms, 'sa.cancelar')) return 'Sem permissão para cancelar SA';
    return null;
  }

  if (STATUS_ORDER[newStatus] < STATUS_ORDER[oldStatus]) {
    if (!isSGQ(perms)) return 'Sem permissão para reabrir fase anterior';
    return null;
  }

  if (oldStatus === 'aberta' && newStatus === 'avaliacao_inicial') {
    if (!hasPermission(perms, 'sa.avaliacao_inicial')) return 'Sem permissão para realizar avaliação inicial';
    return null;
  }

  if (oldStatus === 'avaliacao_inicial' && newStatus === 'avaliacao_areas') {
    if (!hasPermission(perms, 'sa.avaliacao_inicial')) return 'Sem permissão para enviar SA para avaliação de áreas';
    return null;
  }

  if (oldStatus === 'avaliacao_areas' && newStatus === 'montagem_plano') {
    const assignments = sa.triage?.assignments || {};
    const isAssigned = Object.values(assignments).some(id => parseInt(id) === uid);
    if (!isAssigned && !isSGQ(perms)) return 'Sem vínculo com esta SA para avançar avaliação';
    return null;
  }

  if (oldStatus === 'montagem_plano' && newStatus === 'aprovacao_plano') {
    const isPlanResp = parseInt(sa.planResponsible) === uid;
    if (!isPlanResp && !isSGQ(perms)) return 'Sem permissão para submeter plano de ação';
    return null;
  }

  if (oldStatus === 'aprovacao_plano' && newStatus === 'execucao') {
    if (!hasPermission(perms, 'sa.aprovacao_plano')) return 'Sem permissão para aprovar plano de ação';
    return null;
  }

  if (oldStatus === 'execucao' && newStatus === 'concluida') {
    if (!hasPermission(perms, 'sa.concluir')) return 'Sem permissão para concluir SA';
    return null;
  }

  return `Transição inválida: ${oldStatus} → ${newStatus}`;
}

function validateSameStatusUpdate(status, user, sa, perms, uid) {
  if (status === 'concluida' || status === 'cancelada') return null;

  if (status === 'avaliacao_inicial') {
    if (!hasPermission(perms, 'sa.avaliacao_inicial')) return 'Sem permissão para editar avaliação inicial';
    return null;
  }

  if (status === 'avaliacao_areas' || status === 'aprovacao_plano') {
    const assignments = sa.triage?.assignments || {};
    const isAssigned = Object.values(assignments).some(id => parseInt(id) === uid);
    if (!isAssigned && !isSGQ(perms)) return 'Sem vínculo com avaliação desta SA';
    return null;
  }

  if (status === 'montagem_plano') {
    const isPlanResp = parseInt(sa.planResponsible) === uid;
    if (!isPlanResp && !isSGQ(perms)) return 'Sem permissão para editar plano de ação';
    return null;
  }

  return null;
}

// ─── helpers de e-mail ────────────────────────────────────────────────────────

async function getSGQEmails() {
  try {
    const rows = await sql`
      SELECT u.email FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r ON r.id = ur.role_id
      WHERE r.name = 'SGQ' AND u.active = true
    `;
    return rows.map(r => r.email);
  } catch { return []; }
}

async function getUserEmail(userId) {
  try {
    const rows = await sql`SELECT email FROM users WHERE id = ${userId} AND active = true LIMIT 1`;
    return rows[0]?.email || null;
  } catch { return null; }
}

async function getUserEmailsByIds(ids) {
  if (!ids || ids.length === 0) return [];
  try {
    const rows = await sql`SELECT email FROM users WHERE id = ANY(${ids}) AND active = true`;
    return rows.map(r => r.email);
  } catch { return []; }
}

async function dispararEmail(oldStatus, newStatus, sa) {
  try {
    const saInfo = { saId: sa.id, title: sa.title };

    // avaliacao_inicial → avaliacao_areas: notifica responsáveis das áreas
    if (oldStatus === 'avaliacao_inicial' && newStatus === 'avaliacao_areas') {
      const assignments = sa.triage?.assignments || {};
      const userIds = Object.values(assignments).map(id => parseInt(id));
      const emails = await getUserEmailsByIds(userIds);
      if (emails.length > 0) {
        const prazo = sa.stageDeadlines?.avaliacao_areas || 'A definir';
        mailer.avaliacaoArea({ ...saInfo, prazo }, emails);
      }
    }

    // avaliacao_areas → montagem_plano: notifica planResponsible
    if (oldStatus === 'avaliacao_areas' && newStatus === 'montagem_plano') {
      if (sa.planResponsible) {
        const email = await getUserEmail(sa.planResponsible);
        if (email) mailer.avaliacaoConcluida({ ...saInfo, area: 'todas as áreas' }, [email]);
      }
    }

    // montagem_plano → aprovacao_plano: notifica SGQ
    if (oldStatus === 'montagem_plano' && newStatus === 'aprovacao_plano') {
      const sgqEmails = await getSGQEmails();
      if (sgqEmails.length > 0) {
        mailer.planoSubmetido({ ...saInfo, planResponsibleName: sa.planResponsibleName || '' }, sgqEmails);
      }
    }

    // aprovacao_plano → execucao: notifica responsáveis das ações
    if (oldStatus === 'aprovacao_plano' && newStatus === 'execucao') {
      const actions = sa.actions || [];
      const userIds = [...new Set(actions.map(a => parseInt(a.whoId)).filter(Boolean))];
      const emails = await getUserEmailsByIds(userIds);
      if (emails.length > 0) {
        mailer.planoAprovado({ ...saInfo }, emails);
      }
    }

    // execucao → concluida: notifica solicitante + SGQ
    if (oldStatus === 'execucao' && newStatus === 'concluida') {
      const sgqEmails = await getSGQEmails();
      const solicitanteEmail = await getUserEmail(sa.createdBy);
      const emails = [...new Set([...sgqEmails, ...(solicitanteEmail ? [solicitanteEmail] : [])])];
      if (emails.length > 0) {
        mailer.saConcluida({ ...saInfo, createdBy: sa.createdByName || '' }, emails);
      }
    }

    // cancelada: notifica solicitante + SGQ + responsáveis das ações
    if (newStatus === 'cancelada') {
      const sgqEmails = await getSGQEmails();
      const solicitanteEmail = await getUserEmail(sa.createdBy);
      const actions = sa.actions || [];
      const actionUserIds = [...new Set(actions.map(a => parseInt(a.whoId)).filter(Boolean))];
      const actionEmails = await getUserEmailsByIds(actionUserIds);
      const emails = [...new Set([...sgqEmails, ...(solicitanteEmail ? [solicitanteEmail] : []), ...actionEmails])];
      if (emails.length > 0) {
        mailer.saCancelada({ ...saInfo, motivo: sa.cancelReason || '' }, emails);
      }
    }

  } catch (err) {
    console.error('[email] Erro ao disparar e-mail:', err.message);
  }
}

// ─── handler ─────────────────────────────────────────────────────────────────

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

      const rows = await sql`SELECT data FROM requests WHERE id = ${id} LIMIT 1`;
      if (!rows[0]) return res.status(404).json({ error: 'SA nao encontrada' });

      const currentSA = rows[0].data;
      const oldStatus = currentSA.status || 'aberta';
      const newStatus = newSA.status || oldStatus;

      if (!VALID_STATUSES.has(newStatus)) {
        return res.status(400).json({ error: `Status inválido: ${newStatus}` });
      }

      const err = validateTransition(oldStatus, newStatus, user, newSA);
      if (err) {
        const isForbidden = err.includes('permissão') || err.includes('vínculo');
        return res.status(isForbidden ? 403 : 400).json({ error: err });
      }

      await sql`
        UPDATE requests
        SET data = ${JSON.stringify(newSA)},
            status = ${newStatus},
            updated_at = now()
        WHERE id = ${id}
      `;

      // Disparar e-mail se houve mudança de status
      if (oldStatus !== newStatus) {
        dispararEmail(oldStatus, newStatus, newSA);
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error('PUT request error:', err);
      return res.status(500).json({ error: 'Erro ao atualizar SA' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
