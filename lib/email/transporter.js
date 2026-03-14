const nodemailer = require('nodemailer');

let _transporter = null;
let _testAccount = null;

async function getTransporter() {
  // Se já foi criado, reutiliza
  if (_transporter) return _transporter;

  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    // Cria conta temporária no Ethereal (servidor SMTP falso para testes)
    _testAccount = await nodemailer.createTestAccount();

    _transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: _testAccount.user,
        pass: _testAccount.pass,
      },
    });

    console.log('📧 [DEV] Usando Ethereal Email para testes');
    console.log(`📧 [DEV] Inbox: https://ethereal.email/messages`);
    console.log(`📧 [DEV] Usuário: ${_testAccount.user}`);
    console.log(`📧 [DEV] Senha: ${_testAccount.pass}`);

  } else {
    // Produção — usa Resend via SMTP
    _transporter = nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: {
        user: 'resend',
        pass: process.env.RESEND_API_KEY,
      },
    });

    console.log('📧 [PROD] Usando Resend como provedor de e-mail');
  }

  return _transporter;
}

// Retorna a URL da inbox do Ethereal (só funciona em dev)
function getTestInboxUrl() {
  if (_testAccount) {
    return `https://ethereal.email/messages`;
  }
  return null;
}

module.exports = { getTransporter, getTestInboxUrl };
