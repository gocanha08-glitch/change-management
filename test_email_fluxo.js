// test_email_fluxo.js — testa todos os disparos de e-mail pelo fluxo real da SA
// Rodar: node test_email_fluxo.js

require('dotenv').config();
const mailer = require('./lib/email/mailer');

const DEV_EMAIL = process.env.DEV_EMAIL;

// Simula os usuários do banco
const USUARIOS = {
  gabriel:  { id: 19, name: 'Gabriel Silveira Ocanha', email: DEV_EMAIL, grupo: 'SGQ' },
  daniel:   { id: 3,  name: 'Daniel Capucho',          email: DEV_EMAIL, grupo: 'Geral' },
  admin:    { id: 1,  name: 'Admin',                   email: DEV_EMAIL, grupo: 'Administrador' },
};

// SA de teste
const SA = {
  saId: 'SA-TEST/2026',
  title: 'Teste Completo de E-mails',
  area: 'Qualidade',
  createdBy: USUARIOS.daniel.name,
  description: 'SA criada para testar todos os disparos de e-mail',
  planResponsibleName: USUARIOS.gabriel.name,
  motivo: 'Mudança de escopo do projeto',
  tarefa: 'Revisar documentação técnica',
  prazo: '25/03/2026',
  etapa: 'Execução',
};

async function testar(numero, descricao, fn) {
  try {
    await fn();
    console.log(`✅ ${numero}. ${descricao}`);
  } catch(e) {
    console.log(`❌ ${numero}. ${descricao}: ${e.message}`);
  }
  // Delay para não estourar rate limit do Resend (2 req/s)
  await new Promise(r => setTimeout(r, 600));
}

async function run() {
  console.log('\n🔧 Testando fluxo completo de e-mails...');
  console.log(`📧 Todos os e-mails vão para: ${DEV_EMAIL}\n`);

  // 1. SA criada → SGQ
  await testar(1, 'SA criada → SGQ notificado', () =>
    mailer.novaSA(SA, [DEV_EMAIL])
  );

  // 2. SA vai para avaliação de área → responsáveis das áreas
  await testar(2, 'SA enviada para avaliação de área → responsáveis notificados', () =>
    mailer.avaliacaoArea({ saId: SA.saId, title: SA.title, prazo: SA.prazo }, [DEV_EMAIL])
  );

  // 3. Avaliação concluída → responsável pelo plano
  await testar(3, 'Avaliação concluída → responsável pelo plano notificado', () =>
    mailer.avaliacaoConcluida({ saId: SA.saId, title: SA.title, area: SA.area }, [DEV_EMAIL])
  );

  // 4. Plano submetido → SGQ
  await testar(4, 'Plano submetido → SGQ notificado para aprovar', () =>
    mailer.planoSubmetido({ saId: SA.saId, title: SA.title, planResponsibleName: SA.planResponsibleName }, [DEV_EMAIL])
  );

  // 5. Plano aprovado → responsáveis das ações
  await testar(5, 'Plano aprovado → responsáveis das ações notificados', () =>
    mailer.planoAprovado({ saId: SA.saId, title: SA.title }, [DEV_EMAIL])
  );

  // 6. SA concluída → solicitante + SGQ
  await testar(6, 'SA concluída → solicitante + SGQ notificados', () =>
    mailer.saConcluida({ saId: SA.saId, title: SA.title, createdBy: SA.createdBy }, [DEV_EMAIL])
  );

  // 7. SA cancelada → solicitante + SGQ + responsáveis ações
  await testar(7, 'SA cancelada → todos os envolvidos notificados', () =>
    mailer.saCancelada({ saId: SA.saId, title: SA.title, motivo: SA.motivo }, [DEV_EMAIL])
  );

  // 8. Tarefa atribuída → responsável
  await testar(8, 'Tarefa atribuída → responsável notificado', () =>
    mailer.tarefaAtribuida({ saId: SA.saId, title: SA.title, tarefa: SA.tarefa, prazo: SA.prazo }, DEV_EMAIL)
  );

  // 9. Prazo próximo → responsável
  await testar(9, 'Prazo próximo → responsável notificado', () =>
    mailer.prazoProximo({ saId: SA.saId, title: SA.title, etapa: SA.etapa, prazo: SA.prazo }, DEV_EMAIL)
  );

  console.log('\n✅ Todos os testes concluídos!');
  console.log(`📬 Verifique o e-mail: ${DEV_EMAIL}\n`);
}

run();
