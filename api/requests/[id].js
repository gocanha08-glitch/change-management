// api/requests/[id].js — GET one, PUT update
const { sql } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const { hasPermission } = require('../../lib/permissions');
const mailer = require('../../lib/email/mailer');
const crypto = require('crypto');

const ALLOWED_ORIGINS = [
  'https://change-management-eta.vercel.app',
  'https://vydence-change.vercel.app',
  process.env.APP_URL,
].filter(Boolean);

const CORS = (req, res) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
};

const STATUS_ORDER = {
  aberta: 0, avaliacao_inicial: 1, avaliacao_areas: 2,
  aprovacao_plano: 3, montagem_plano: 4, execucao: 5,
  concluida: 6, cancelada: 7
};
const VALID_STATUSES = new Set(Object.keys(STATUS_ORDER));

function isSGQ(perms) { return hasPermission(perms, 'sa.avaliacao_inicial'); }

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
  if (oldStatus === 'avaliacao_areas' && newStatus === 'aprovacao_plano') {
    const assignments = sa.triage?.assignments || {};
    const isAssigned = Object.values(assignments).some(id => parseInt(id) === uid);
    if (!isAssigned && !isSGQ(perms)) return 'Sem vínculo com esta SA para avançar avaliação';
    return null;
  }
  if (oldStatus === 'aprovacao_plano' && newStatus === 'montagem_plano') {
    if (!isSGQ(perms)) return 'Sem permissão para aprovar avaliações';
    return null;
  }
  if (oldStatus === 'montagem_plano' && newStatus === 'execucao') {
    const isPlanResp = parseInt(sa.planResponsible) === uid;
    if (!isPlanResp && !isSGQ(perms)) return 'Sem permissão para liberar plano para execução';
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
  if (status === 'execucao') {
    const actions = sa.actions || [];
    const isResponsible = actions.some(a => parseInt(a.responsible) === uid);
    if (!isResponsible && !isSGQ(perms)) return 'Sem vínculo com ações desta SA';
    return null;
  }
  return null;
}

async function getSGQEmails() {
  try {
    const rows = await sql`SELECT u.email FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE r.name = 'SGQ' AND u.active = true`;
    return rows.map(r => r.email);
  } catch { return []; }
}

async function getUserEmail(userId) {
  try {
    const rows = await sql`SELECT email FROM users WHERE id = ${userId} AND active = true LIMIT 1`;
    return rows[0]?.email || null;
  } catch { return null; }
}

async function dispararEmail(oldStatus, newStatus, sa) {
  try {
    const BASE_URL = process.env.APP_URL || 'https://change-management-eta.vercel.app';
    const saUrl = `${BASE_URL}/?view=detail&id=${encodeURIComponent(sa.id)}`;
    if (oldStatus === 'avaliacao_inicial' && newStatus === 'avaliacao_areas') {
      const assignments = sa.triage?.assignments || {};
      const areas = sa.triage?.assignedAreas || [];
      for (const dept of areas) {
        const userId = assignments[dept];
        if (!userId) continue;
        const rows = await sql`SELECT name, email FROM users WHERE id = ${userId} AND active = true LIMIT 1`;
        const u = rows[0];
        if (!u?.email) continue;
        mailer.sendEvaluationPending({ to: u.email, name: u.name, saId: sa.id, saTitle: sa.title, dept, deadline: sa.triage?.deadlines?.[dept] || 'A definir', saUrl });
      }
    }
    if (oldStatus === 'avaliacao_areas' && newStatus === 'aprovacao_plano') {
      const sgqEmails = await getSGQEmails();
      const doneEvals = Object.keys(sa.evaluations || {}).filter(d => sa.evaluations[d]?.at).length;
      if (sgqEmails.length > 0) mailer.sendApprovalPending({ to: sgqEmails, saId: sa.id, saTitle: sa.title, doneEvals, totalEvals: (sa.triage?.assignedAreas || []).length, saUrl });
    }
    if (oldStatus === 'montagem_plano' && newStatus === 'execucao') {
      const actions = sa.actions || [];
      const userIds = [...new Set(actions.map(a => parseInt(a.responsible)).filter(Boolean))];
      for (const uid of userIds) {
        const rows = await sql`SELECT name, email FROM users WHERE id = ${uid} AND active = true LIMIT 1`;
        const u = rows[0];
        if (!u?.email) continue;
        for (const ac of actions.filter(a => parseInt(a.responsible) === uid)) {
          mailer.sendEvaluationPending({ to: u.email, name: u.name, saId: sa.id, saTitle: sa.title, dept: 'Execução', deadline: ac.deadline, saUrl });
        }
      }
    }
    if (oldStatus === 'execucao' && newStatus === 'concluida') {
      const email = await getUserEmail(sa.createdBy);
      if (email) mailer.sendSAConcluded({ to: email, name: sa.createdByName, saId: sa.id, saTitle: sa.title, concludedBy: sa.verifiedByName || '', verifyNote: sa.verifyNote || '', saUrl });
    }
  } catch (err) { console.error('[email] Erro:', err.message); }
}

async function salvarAssinatura(req, sa, user, action, actionDetail, meaning) {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const payload = `${sa.id}|${user.id}|${user.name}|${action}|${new Date().toISOString()}`;
    const hash = crypto.createHash('sha256').update(payload).digest('hex');
    await sql`
      INSERT INTO signatures (sa_id, signed_by_id, signed_by, action, action_detail, meaning, hash, ip_address, user_agent, signed_at)
      VALUES (${sa.id}, ${parseInt(user.id)}, ${user.name}, ${action}, ${actionDetail || ''}, ${meaning || ''}, ${hash}, ${ip}, ${userAgent}, now())
    `;
  } catch (err) { console.error('[assinatura] Erro:', err.message); }
}

const ACOES_LABEL = {
  avaliacao_inicial: { action: 'avaliacao_inicial', detail: 'Avaliação Inicial realizada', meaning: 'Confirmo a avaliação inicial desta SA' },
  avaliacao_areas: { action: 'avaliacao_areas', detail: 'SA enviada para Avaliação de Áreas', meaning: 'Confirmo o encaminhamento para avaliação das áreas' },
  aprovacao_plano: { action: 'aprovacao_plano', detail: 'Avaliações de áreas aprovadas', meaning: 'Aprovo as avaliações e autorizo montagem do plano' },
  montagem_plano: { action: 'montagem_plano', detail: 'Plano de Ação liberado para execução', meaning: 'Aprovo o plano de ação e autorizo execução' },
  execucao: { action: 'execucao', detail: 'SA em execução', meaning: 'Confirmo início da execução' },
  concluida: { action: 'conclusao', detail: 'SA Concluída', meaning: 'Confirmo a conclusão e encerramento desta SA' },
  cancelada: { action: 'cancelamento', detail: 'SA Cancelada', meaning: 'Confirmo o cancelamento desta SA' },
};

module.exports = async (req, res) => {
  CORS(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'ID obrigatorio' });

  if (req.method === 'GET') {
    try {
      const rows = await sql`SELECT data FROM requests WHERE id = ${id} LIMIT 1`;
      if (!rows[0]) return res.status(404).json({ error: 'SA nao encontrada' });
      const data = rows[0].data;
      data.evaluations = data.evaluations || {};
      data.actions = data.actions || [];
      data.attachments = data.attachments || [];
      data.deadlineExtensions = data.deadlineExtensions || [];
      data.log = data.log || [];
      return res.json(data);
    } catch (err) { return res.status(500).json({ error: 'Erro ao buscar SA' }); }
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

      if (!VALID_STATUSES.has(newStatus)) return res.status(400).json({ error: `Status inválido: ${newStatus}` });

      const err = validateTransition(oldStatus, newStatus, user, newSA);
      if (err) {
        const isForbidden = err.includes('permissão') || err.includes('vínculo');
        return res.status(isForbidden ? 403 : 400).json({ error: err });
      }

      await sql`UPDATE requests SET data = ${JSON.stringify(newSA)}, status = ${newStatus}, updated_at = now() WHERE id = ${id}`;

      if (oldStatus !== newStatus) {
        const assinInfo = ACOES_LABEL[newStatus];
        if (assinInfo) {
          await salvarAssinatura(req, newSA, user, assinInfo.action, assinInfo.detail, assinInfo.meaning);
        }
        dispararEmail(oldStatus, newStatus, newSA);
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error('PUT request error:', err);
      return res.status(500).json({ error: 'Erro ao atualizar SA', detail: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};