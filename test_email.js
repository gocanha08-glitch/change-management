// test_email.js — testa todos os 9 eventos de e-mail
// Rodar: node test_email.js

require('dotenv').config();
const mailer = require('./lib/email/mailer');

const sa = {
  saId: 'SA-TEST/2026',
  title: 'SA de Teste de E-mail',
};

async function run() {
  console.log('\n🔧 Testando todos os eventos de e-mail...\n');
  console.log(`📧 E-mails serão enviados para: ${process.env.DEV_EMAIL}\n`);

  const email = process.env.DEV_EMAIL;

  try { await mailer.novaSA({ ...sa, area: 'TI', createdBy: 'Gabriel', description: 'Teste' }, [email]); console.log('✅ 1. nova_sa'); } catch(e) { console.log('❌ 1. nova_sa:', e.message); }
  try { await mailer.avaliacaoArea({ ...sa, prazo: '21/03/2026' }, [email]); console.log('✅ 2. avaliacao_area'); } catch(e) { console.log('❌ 2. avaliacao_area:', e.message); }
  try { await mailer.avaliacaoConcluida({ ...sa, area: 'Qualidade' }, [email]); console.log('✅ 3. avaliacao_concluida'); } catch(e) { console.log('❌ 3. avaliacao_concluida:', e.message); }
  try { await mailer.planoSubmetido({ ...sa, planResponsibleName: 'Anderson' }, [email]); console.log('✅ 4. plano_submetido'); } catch(e) { console.log('❌ 4. plano_submetido:', e.message); }
  try { await mailer.planoAprovado({ ...sa }, [email]); console.log('✅ 5. plano_aprovado'); } catch(e) { console.log('❌ 5. plano_aprovado:', e.message); }
  try { await mailer.saConcluida({ ...sa, createdBy: 'Daniel' }, [email]); console.log('✅ 6. sa_concluida'); } catch(e) { console.log('❌ 6. sa_concluida:', e.message); }
  try { await mailer.saCancelada({ ...sa, motivo: 'Mudança de escopo' }, [email]); console.log('✅ 7. sa_cancelada'); } catch(e) { console.log('❌ 7. sa_cancelada:', e.message); }
  try { await mailer.tarefaAtribuida({ ...sa, tarefa: 'Revisar doc', prazo: '25/03/2026' }, email); console.log('✅ 8. tarefa_atribuida'); } catch(e) { console.log('❌ 8. tarefa_atribuida:', e.message); }
  try { await mailer.prazoProximo({ ...sa, etapa: 'Execução', prazo: '20/03/2026' }, email); console.log('✅ 9. prazo_proximo'); } catch(e) { console.log('❌ 9. prazo_proximo:', e.message); }

  console.log('\n✅ Testes concluídos! Verifique o e-mail.\n');
}

run();
