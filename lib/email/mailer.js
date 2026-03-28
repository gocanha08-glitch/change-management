// lib/email/mailer.js
// Envio de e-mails via Resend API
// Substitui o Nodemailer/SMTP anterior

const FROM = 'ControleMudancas@vydence.com';
const RESEND_API = 'https://api.resend.com/emails';
const API_KEY = process.env.RESEND_API_KEY;

// ── Helper base de envio ──────────────────────────────────────────
async function sendEmail({ to, subject, html }) {
  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to: Array.isArray(to) ? to : [to], subject, html }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Erro ao enviar e-mail');
  return data;
}

// ── Template base ─────────────────────────────────────────────────
function baseTemplate(title, content) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F4F6FB;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FB;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
        
        <!-- Header -->
        <tr>
          <td style="background:#1E3A5F;padding:24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:2px;">CHANGE</span>
                  <span style="font-size:12px;color:#93C5FD;margin-left:8px;">Gestão de Mudanças</span>
                </td>
                <td align="right">
                  <span style="font-size:10px;color:#93C5FD;">Vydence Medical</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Content -->
        <tr>
          <td style="padding:32px;">
            ${content}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F8FAFC;padding:20px 32px;border-top:1px solid #E5E7EB;">
            <p style="margin:0;font-size:11px;color:#9CA3AF;text-align:center;">
              Este é um e-mail automático do sistema CHANGE — Gestão de Mudanças.<br/>
              Por favor, não responda diretamente a esta mensagem.<br/>
              <a href="https://change-management-eta.vercel.app" style="color:#2563EB;">Acessar o sistema</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── 1. Reset de Senha ─────────────────────────────────────────────
async function sendResetPassword({ to, name, resetUrl }) {
  const content = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#1E3A5F;">Redefinição de Senha</h2>
    <p style="margin:0 0 24px;font-size:13px;color:#6B7280;">Olá, ${name || 'usuário'}!</p>

    <p style="font-size:14px;color:#374151;line-height:1.6;">
      Recebemos uma solicitação para redefinir a senha da sua conta no sistema CHANGE.
      Clique no botão abaixo para criar uma nova senha:
    </p>

    <div style="text-align:center;margin:32px 0;">
      <a href="${resetUrl}" style="background:#2563EB;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:14px;display:inline-block;">
        Redefinir Minha Senha
      </a>
    </div>

    <div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:14px 18px;margin:24px 0;">
      <p style="margin:0;font-size:12px;color:#92400E;">
        ⚠️ Este link expira em <strong>1 hora</strong>. Se você não solicitou a redefinição, ignore este e-mail.
      </p>
    </div>

    <p style="font-size:12px;color:#9CA3AF;">
      Se o botão não funcionar, copie e cole o link abaixo no seu navegador:<br/>
      <a href="${resetUrl}" style="color:#2563EB;word-break:break-all;">${resetUrl}</a>
    </p>
  `;
  return sendEmail({ to, subject: 'CHANGE — Redefinição de Senha', html: baseTemplate('Redefinição de Senha', content) });
}

// ── 2. Avaliação Pendente (para o avaliador) ──────────────────────
async function sendEvaluationPending({ to, name, saId, saTitle, dept, deadline, saUrl }) {
  const content = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#1E3A5F;">Avaliação de Impacto Pendente</h2>
    <p style="margin:0 0 24px;font-size:13px;color:#6B7280;">Olá, ${name}!</p>

    <p style="font-size:14px;color:#374151;line-height:1.6;">
      Você foi designado como responsável pela avaliação de impacto da área
      <strong>${dept}</strong> na seguinte solicitação de alteração:
    </p>

    <div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:10px;padding:20px 24px;margin:24px 0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 0;">
            <span style="font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Controle</span><br/>
            <span style="font-size:16px;font-weight:800;color:#1E3A5F;">${saId}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;border-top:1px solid #E0F2FE;">
            <span style="font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Título</span><br/>
            <span style="font-size:14px;color:#374151;">${saTitle}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;border-top:1px solid #E0F2FE;">
            <span style="font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Sua Área</span><br/>
            <span style="font-size:14px;color:#374151;">${dept}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;border-top:1px solid #E0F2FE;">
            <span style="font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Prazo</span><br/>
            <span style="font-size:14px;font-weight:700;color:#DC2626;">${deadline}</span>
          </td>
        </tr>
      </table>
    </div>

    <div style="text-align:center;margin:28px 0;">
      <a href="${saUrl}" style="background:#2563EB;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:14px;display:inline-block;">
        Realizar Avaliação →
      </a>
    </div>

    <p style="font-size:12px;color:#9CA3AF;text-align:center;">
      Acesse o sistema CHANGE e clique em "Avaliar" na coluna correspondente à sua área.
    </p>
  `;
  return sendEmail({ to, subject: `CHANGE — Avaliação Pendente: ${saId}`, html: baseTemplate('Avaliação Pendente', content) });
}

// ── 3. Aprovação Pendente (para o SGQ) ───────────────────────────
async function sendApprovalPending({ to, saId, saTitle, doneEvals, totalEvals, saUrl }) {
  const content = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#1E3A5F;">Aprovação de Avaliações Pendente</h2>
    <p style="margin:0 0 24px;font-size:13px;color:#6B7280;">Atenção, SGQ!</p>

    <p style="font-size:14px;color:#374151;line-height:1.6;">
      Todas as avaliações de impacto foram concluídas para a solicitação abaixo.
      O próximo passo é a aprovação pelo SGQ para iniciar a montagem do plano de ação.
    </p>

    <div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:10px;padding:20px 24px;margin:24px 0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 0;">
            <span style="font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Controle</span><br/>
            <span style="font-size:16px;font-weight:800;color:#1E3A5F;">${saId}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;border-top:1px solid #BBF7D0;">
            <span style="font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Título</span><br/>
            <span style="font-size:14px;color:#374151;">${saTitle}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;border-top:1px solid #BBF7D0;">
            <span style="font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Avaliações</span><br/>
            <span style="font-size:14px;font-weight:700;color:#16A34A;">${doneEvals}/${totalEvals} concluídas ✓</span>
          </td>
        </tr>
      </table>
    </div>

    <div style="text-align:center;margin:28px 0;">
      <a href="${saUrl}" style="background:#16A34A;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:14px;display:inline-block;">
        Revisar e Aprovar →
      </a>
    </div>
  `;
  return sendEmail({ to, subject: `CHANGE — Aguarda Aprovação SGQ: ${saId}`, html: baseTemplate('Aprovação Pendente', content) });
}

// ── 4. Nova SA Aberta (para o SGQ) ───────────────────────────────
async function sendNewSA({ to, saId, saTitle, saType, createdBy, saUrl }) {
  const content = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#1E3A5F;">Nova Solicitação de Alteração</h2>
    <p style="margin:0 0 24px;font-size:13px;color:#6B7280;">Atenção, SGQ!</p>

    <p style="font-size:14px;color:#374151;line-height:1.6;">
      Uma nova Solicitação de Alteração foi aberta e aguarda a Avaliação Inicial pelo SGQ.
    </p>

    <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:20px 24px;margin:24px 0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 0;">
            <span style="font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Número</span><br/>
            <span style="font-size:16px;font-weight:800;color:#1E3A5F;">${saId}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;border-top:1px solid #FDBA74;">
            <span style="font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Título</span><br/>
            <span style="font-size:14px;color:#374151;">${saTitle}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;border-top:1px solid #FDBA74;">
            <span style="font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Tipo</span><br/>
            <span style="font-size:14px;color:#374151;">${saType}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;border-top:1px solid #FDBA74;">
            <span style="font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Solicitante</span><br/>
            <span style="font-size:14px;color:#374151;">${createdBy}</span>
          </td>
        </tr>
      </table>
    </div>

    <div style="text-align:center;margin:28px 0;">
      <a href="${saUrl}" style="background:#F97316;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:14px;display:inline-block;">
        Realizar Avaliação Inicial →
      </a>
    </div>
  `;
  return sendEmail({ to, subject: `CHANGE — Nova SA Aberta: ${saId}`, html: baseTemplate('Nova SA Aberta', content) });
}

// ── 5. Ação Atrasada (para o responsável) ────────────────────────
async function sendActionOverdue({ to, name, saId, saTitle, acId, acDesc, deadline, saUrl }) {
  const content = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#DC2626;">Ação com Prazo Vencido</h2>
    <p style="margin:0 0 24px;font-size:13px;color:#6B7280;">Olá, ${name}!</p>

    <p style="font-size:14px;color:#374151;line-height:1.6;">
      Uma ação do plano de execução sob sua responsabilidade está com o prazo vencido.
      Por favor, conclua ou solicite extensão de prazo o quanto antes.
    </p>

    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:20px 24px;margin:24px 0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 0;">
            <span style="font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Controle</span><br/>
            <span style="font-size:15px;font-weight:800;color:#1E3A5F;">${saId} — ${saTitle}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;border-top:1px solid #FECACA;">
            <span style="font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Ação</span><br/>
            <span style="font-size:14px;color:#374151;">${acId} — ${acDesc}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;border-top:1px solid #FECACA;">
            <span style="font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Prazo (vencido)</span><br/>
            <span style="font-size:14px;font-weight:700;color:#DC2626;">⚠️ ${deadline}</span>
          </td>
        </tr>
      </table>
    </div>

    <div style="text-align:center;margin:28px 0;">
      <a href="${saUrl}" style="background:#DC2626;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:14px;display:inline-block;">
        Ver Ação →
      </a>
    </div>
  `;
  return sendEmail({ to, subject: `CHANGE — Ação Atrasada: ${acId} (${saId})`, html: baseTemplate('Ação Atrasada', content) });
}

// ── 6. SA Concluída (para o solicitante) ─────────────────────────
async function sendSAConcluded({ to, name, saId, saTitle, concludedBy, verifyNote, saUrl }) {
  const content = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#16A34A;">Solicitação de Alteração Encerrada</h2>
    <p style="margin:0 0 24px;font-size:13px;color:#6B7280;">Olá, ${name}!</p>

    <p style="font-size:14px;color:#374151;line-height:1.6;">
      A Solicitação de Alteração que você abriu foi concluída com sucesso pelo SGQ.
    </p>

    <div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:10px;padding:20px 24px;margin:24px 0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 0;">
            <span style="font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Controle</span><br/>
            <span style="font-size:16px;font-weight:800;color:#1E3A5F;">${saId}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;border-top:1px solid #BBF7D0;">
            <span style="font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Título</span><br/>
            <span style="font-size:14px;color:#374151;">${saTitle}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;border-top:1px solid #BBF7D0;">
            <span style="font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Encerrado por</span><br/>
            <span style="font-size:14px;color:#374151;">${concludedBy}</span>
          </td>
        </tr>
        ${verifyNote ? `
        <tr>
          <td style="padding:6px 0;border-top:1px solid #BBF7D0;">
            <span style="font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Observação Final</span><br/>
            <span style="font-size:13px;color:#374151;font-style:italic;">"${verifyNote}"</span>
          </td>
        </tr>` : ''}
      </table>
    </div>

    <div style="text-align:center;margin:28px 0;">
      <a href="${saUrl}" style="background:#16A34A;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:14px;display:inline-block;">
        Ver Registro Completo →
      </a>
    </div>
  `;
  return sendEmail({ to, subject: `CHANGE — SA Encerrada: ${saId}`, html: baseTemplate('SA Concluída', content) });
}

module.exports = {
  sendResetPassword,
  sendEvaluationPending,
  sendApprovalPending,
  sendNewSA,
  sendActionOverdue,
  sendSAConcluded,
};
