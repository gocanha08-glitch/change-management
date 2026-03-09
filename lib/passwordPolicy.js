// lib/passwordPolicy.js — Política de senha centralizada
// Usada por: login.js, reset.js, api/users/index.js

const BLACKLIST = [
  '12345678','123456789','1234567890','password','senha123','senha@123',
  'qwerty123','qwerty@1','abc12345','abc@1234','iloveyou','welcome1',
  'admin123','admin@123','mudar123','mudar@123','change123','change@123',
  'Pass@1234','Senha@123','Abc@1234','Test@1234','User@1234',
  '11111111','22222222','33333333','44444444','55555555',
  'aaaaaaaa','bbbbbbbb','cccccccc',
];

const SEQUENCES = [
  '12345678','23456789','34567890','abcdefgh','qwertyui','qwertyuiop',
  '87654321','98765432','hgfedcba',
];

/**
 * Valida a senha conforme política de segurança.
 * @param {string} pwd - Senha a validar
 * @param {object} user - { name, email } para verificar dados pessoais
 * @returns {string|null} - Mensagem de erro ou null se válida
 */
function validatePassword(pwd, user = {}) {
  if (!pwd || typeof pwd !== 'string') return 'Senha obrigatoria';

  // Comprimento
  if (pwd.length < 8)  return 'Senha deve ter no minimo 8 caracteres';
  if (pwd.length > 20) return 'Senha deve ter no maximo 20 caracteres';

  // Complexidade
  if (!/[A-Z]/.test(pwd)) return 'Senha deve conter ao menos 1 letra maiuscula';
  if (!/[a-z]/.test(pwd)) return 'Senha deve conter ao menos 1 letra minuscula';
  if (!/[0-9]/.test(pwd)) return 'Senha deve conter ao menos 1 numero';
  if (!/[^A-Za-z0-9]/.test(pwd)) return 'Senha deve conter ao menos 1 caractere especial (!@#$%...)';

  // Repetições triviais (ex: aaaabbbb, 11112222)
  if (/(.)\1{4,}/.test(pwd)) return 'Senha nao pode conter caracteres repetidos em sequencia';

  // Sequências previsíveis
  const pwdLower = pwd.toLowerCase();
  for (const seq of SEQUENCES) {
    if (pwdLower.includes(seq)) return 'Senha nao pode conter sequencias previsíveis';
  }

  // Blacklist
  for (const weak of BLACKLIST) {
    if (pwdLower === weak.toLowerCase()) return 'Senha muito fraca ou comum';
  }

  // Dados pessoais do usuário
  if (user.name) {
    const parts = user.name.toLowerCase().split(/\s+/).filter(p => p.length >= 3);
    for (const part of parts) {
      if (pwdLower.includes(part)) return 'Senha nao pode conter seu nome';
    }
  }
  if (user.email) {
    const emailLocal = user.email.toLowerCase().split('@')[0];
    if (emailLocal.length >= 3 && pwdLower.includes(emailLocal)) {
      return 'Senha nao pode conter seu e-mail';
    }
  }

  return null; // ✅ válida
}

module.exports = { validatePassword };
