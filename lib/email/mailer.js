// lib/email/mailer.js — funções de disparo de e-mail por evento
const { sendEmail } = require('./transporter');

const APP_URL = process.env.APP_URL || 'https://change-management-eta.vercel.app';

// 1. Nova SA criada → SGQ
async function novaSA({ saId, title, area, createdBy, description }, toEmails) {
  await sendEmail({
    to: toEmails,
    subject: `[CHANGE] Nova SA criada: ${saId} — ${title}`,
    html: `<h2>Nova Solicitação de Alteração criada</h2>
     <p><strong>ID:</strong> ${saId}</p>
     <p><strong>Título:</strong> ${title}</p>
     <p><strong>Área:</strong> ${area}</p>
     <p><strong>Criado por:</strong> ${createdBy}</p>
     <p><strong>Descrição:</strong> ${description}</p>
     <hr/><p><a href="${APP_URL}">Acessar o sistema</a></p>`
  });
}

// 2. SA enviada para avaliação de área → responsável da área
async function avaliacaoArea({ saId, title, prazo }, toEmails) {
  await sendEmail({
    to: toEmails,
    subject: `[CHANGE] SA ${saId} aguarda sua avaliação`,
    html: `<h2>Solicitação de Alteração aguarda avaliação</h2>
     <p>A SA <strong>${saId} — ${title}</strong> foi encaminhada para avaliação da sua área.</p>
     <p><strong>Prazo:</strong> ${prazo || 'A definir'}</p>
     <hr/><p><a href="${APP_URL}">Acessar o sistema</a></p>`
  });
}

// 3. Avaliação concluída → SGQ
async function avaliacaoConcluida({ saId, title, area }, toEmails) {
  await sendEmail({
    to: toEmails,
    subject: `[CHANGE] Avaliação concluída: ${saId}`,
    html: `<h2>Avaliação de área concluída</h2>
     <p>A SA <strong>${saId} — ${title}</strong> teve sua avaliação concluída.</p>
     <p><strong>Área:</strong> ${area}</p>
     <hr/><p><a href="${APP_URL}">Acessar o sistema</a></p>`
  });
}

// 4. Plano submetido para aprovação → aprovadores
async function planoSubmetido({ saId, title, planResponsibleName }, toEmails) {
  await sendEmail({
    to: toEmails,
    subject: `[CHANGE] Plano de ação submetido: ${saId}`,
    html: `<h2>Plano de ação aguarda aprovação</h2>
     <p>A SA <strong>${saId} — ${title}</strong> teve seu plano submetido.</p>
     <p><strong>Responsável pelo plano:</strong> ${planResponsibleName}</p>
     <hr/><p><a href="${APP_URL}">Acessar o sistema</a></p>`
  });
}

// 5. Plano aprovado → responsáveis de ações
async function planoAprovado({ saId, title }, toEmails) {
  await sendEmail({
    to: toEmails,
    subject: `[CHANGE] Plano aprovado — início da execução: ${saId}`,
    html: `<h2>Plano de ação aprovado</h2>
     <p>O plano da SA <strong>${saId} — ${title}</strong> foi aprovado.</p>
     <p>A execução das ações pode começar.</p>
     <hr/><p><a href="${APP_URL}">Acessar o sistema</a></p>`
  });
}

// 6. SA concluída → solicitante + SGQ
async function saConcluida({ saId, title, createdBy }, toEmails) {
  await sendEmail({
    to: toEmails,
    subject: `[CHANGE] SA concluída: ${saId}`,
    html: `<h2>Solicitação de Alteração concluída</h2>
     <p>A SA <strong>${saId} — ${title}</strong> foi concluída com sucesso.</p>
     <p><strong>Solicitante:</strong> ${createdBy}</p>
     <hr/><p><a href="${APP_URL}">Acessar o sistema</a></p>`
  });
}

// 7. SA cancelada → envolvidos
async function saCancelada({ saId, title, motivo }, toEmails) {
  await sendEmail({
    to: toEmails,
    subject: `[CHANGE] SA cancelada: ${saId}`,
    html: `<h2>Solicitação de Alteração cancelada</h2>
     <p>A SA <strong>${saId} — ${title}</strong> foi cancelada.</p>
     <p><strong>Motivo:</strong> ${motivo || 'Não informado'}</p>
     <hr/><p><a href="${APP_URL}">Acessar o sistema</a></p>`
  });
}

// 8. Tarefa atribuída → responsável
async function tarefaAtribuida({ saId, title, tarefa, prazo }, toEmail) {
  await sendEmail({
    to: toEmail,
    subject: `[CHANGE] Nova tarefa atribuída a você: ${saId}`,
    html: `<h2>Você recebeu uma tarefa</h2>
     <p>Uma nova tarefa foi atribuída a você na SA <strong>${saId} — ${title}</strong>.</p>
     <p><strong>Tarefa:</strong> ${tarefa}</p>
     <p><strong>Prazo:</strong> ${prazo || 'A definir'}</p>
     <hr/><p><a href="${APP_URL}">Acessar o sistema</a></p>`
  });
}

// 9. Prazo próximo → responsável
async function prazoProximo({ saId, title, etapa, prazo }, toEmail) {
  await sendEmail({
    to: toEmail,
    subject: `[CHANGE] ⚠️ Prazo próximo do vencimento: ${saId}`,
    html: `<h2>Atenção — prazo próximo do vencimento</h2>
     <p>A SA <strong>${saId} — ${title}</strong> tem prazo vencendo em breve.</p>
     <p><strong>Etapa:</strong> ${etapa}</p>
     <p><strong>Prazo:</strong> ${prazo}</p>
     <hr/><p><a href="${APP_URL}">Acessar o sistema</a></p>`
  });
}

module.exports = {
  novaSA,
  avaliacaoArea,
  avaliacaoConcluida,
  planoSubmetido,
  planoAprovado,
  saConcluida,
  saCancelada,
  tarefaAtribuida,
  prazoProximo,
};
