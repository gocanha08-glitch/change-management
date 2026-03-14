const { getTransporter, getTestInboxUrl } = require('../../lib/email/transporter');
const { verifyToken } = require('../../lib/auth');

// Templates de e-mail por evento
const templates = {
  nova_sa: (data) => ({
    subject: `[CHANGE] Nova SA criada: ${data.saId} — ${data.title}`,
    html: `
      <h2>Nova Solicitação de Alteração criada</h2>
      <p><strong>ID:</strong> ${data.saId}</p>
      <p><strong>Título:</strong> ${data.title}</p>
      <p><strong>Área:</strong> ${data.area}</p>
      <p><strong>Criado por:</strong> ${data.createdBy}</p>
      <p><strong>Descrição:</strong> ${data.description}</p>
      <hr/>
      <p><a href="${process.env.APP_URL}">Acessar o sistema</a></p>
    `,
  }),

  avaliacao_area: (data) => ({
    subject: `[CHANGE] SA ${data.saId} aguarda sua avaliação`,
    html: `
      <h2>Solicitação de Alteração aguarda avaliação</h2>
      <p>Olá, <strong>${data.responsavel}</strong>!</p>
      <p>A SA <strong>${data.saId} — ${data.title}</strong> foi encaminhada para avaliação da sua área.</p>
      <p><strong>Prazo:</strong> ${data.prazo || 'A definir'}</p>
      <hr/>
      <p><a href="${process.env.APP_URL}">Acessar o sistema</a></p>
    `,
  }),

  avaliacao_concluida: (data) => ({
    subject: `[CHANGE] Avaliação concluída: ${data.saId}`,
    html: `
      <h2>Avaliação de área concluída</h2>
      <p>A SA <strong>${data.saId} — ${data.title}</strong> teve sua avaliação concluída.</p>
      <p><strong>Área:</strong> ${data.area}</p>
      <hr/>
      <p><a href="${process.env.APP_URL}">Acessar o sistema</a></p>
    `,
  }),

  plano_submetido: (data) => ({
    subject: `[CHANGE] Plano de ação submetido para aprovação: ${data.saId}`,
    html: `
      <h2>Plano de ação aguarda aprovação</h2>
      <p>A SA <strong>${data.saId} — ${data.title}</strong> teve seu plano de ação submetido.</p>
      <p><strong>Responsável pelo plano:</strong> ${data.planResponsible}</p>
      <hr/>
      <p><a href="${process.env.APP_URL}">Acessar o sistema</a></p>
    `,
  }),

  plano_aprovado: (data) => ({
    subject: `[CHANGE] Plano aprovado — início da execução: ${data.saId}`,
    html: `
      <h2>Plano de ação aprovado</h2>
      <p>O plano da SA <strong>${data.saId} — ${data.title}</strong> foi aprovado.</p>
      <p>A execução das ações pode começar.</p>
      <hr/>
      <p><a href="${process.env.APP_URL}">Acessar o sistema</a></p>
    `,
  }),

  sa_concluida: (data) => ({
    subject: `[CHANGE] SA concluída: ${data.saId}`,
    html: `
      <h2>Solicitação de Alteração concluída</h2>
      <p>A SA <strong>${data.saId} — ${data.title}</strong> foi concluída com sucesso.</p>
      <p><strong>Solicitante:</strong> ${data.createdBy}</p>
      <hr/>
      <p><a href="${process.env.APP_URL}">Acessar o sistema</a></p>
    `,
  }),

  sa_cancelada: (data) => ({
    subject: `[CHANGE] SA cancelada: ${data.saId}`,
    html: `
      <h2>Solicitação de Alteração cancelada</h2>
      <p>A SA <strong>${data.saId} — ${data.title}</strong> foi cancelada.</p>
      <p><strong>Motivo:</strong> ${data.motivo || 'Não informado'}</p>
      <hr/>
      <p><a href="${process.env.APP_URL}">Acessar o sistema</a></p>
    `,
  }),

  tarefa_atribuida: (data) => ({
    subject: `[CHANGE] Nova tarefa atribuída a você: ${data.saId}`,
    html: `
      <h2>Você recebeu uma tarefa</h2>
      <p>Olá, <strong>${data.responsavel}</strong>!</p>
      <p>Uma nova tarefa foi atribuída a você na SA <strong>${data.saId} — ${data.title}</strong>.</p>
      <p><strong>Tarefa:</strong> ${data.tarefa}</p>
      <p><strong>Prazo:</strong> ${data.prazo || 'A definir'}</p>
      <hr/>
      <p><a href="${process.env.APP_URL}">Acessar o sistema</a></p>
    `,
  }),

  prazo_proximo: (data) => ({
    subject: `[CHANGE] ⚠️ Prazo próximo do vencimento: ${data.saId}`,
    html: `
      <h2>Atenção — prazo próximo do vencimento</h2>
      <p>Olá, <strong>${data.responsavel}</strong>!</p>
      <p>A SA <strong>${data.saId} — ${data.title}</strong> tem prazo vencendo em breve.</p>
      <p><strong>Etapa:</strong> ${data.etapa}</p>
      <p><strong>Prazo:</strong> ${data.prazo}</p>
      <hr/>
      <p><a href="${process.env.APP_URL}">Acessar o sistema</a></p>
    `,
  }),
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Verificar autenticação
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Não autenticado' });

  try {
    verifyToken(authHeader.replace('Bearer ', ''));
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }

  const { evento, para, dados } = req.body;

  // Validações básicas
  if (!evento || !para || !dados) {
    return res.status(400).json({ error: 'Campos obrigatórios: evento, para, dados' });
  }

  const template = templates[evento];
  if (!template) {
    return res.status(400).json({
      error: `Evento inválido: ${evento}`,
      eventosValidos: Object.keys(templates),
    });
  }

  try {
    const transporter = await getTransporter();
    const { subject, html } = template(dados);

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@vydence.com',
      to: Array.isArray(para) ? para.join(', ') : para,
      subject,
      html,
    });

    const response = {
      success: true,
      messageId: info.messageId,
      evento,
    };

    // Em dev, retorna link da inbox do Ethereal
    const inboxUrl = getTestInboxUrl();
    if (inboxUrl) {
      response.dev_inbox = inboxUrl;
      response.dev_preview = nodemailer.getTestMessageUrl(info);
    }

    return res.status(200).json(response);

  } catch (err) {
    console.error('[email/send] Erro ao enviar e-mail:', err);
    return res.status(500).json({ error: 'Falha ao enviar e-mail', detail: err.message });
  }
};
