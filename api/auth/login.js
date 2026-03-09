// api/auth/login.js — v10.1.0 com permissões por grupos
const { sql } = require('../../lib/db');
const { signToken } = require('../../lib/auth');
const { getUserPermissions, getUserRoles } = require('../../lib/permissions');
const bcrypt = require('bcryptjs');

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatorios' });

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';

  try {
    const rows = await sql`
      SELECT id, name, email, area, role, pwd_hash, eval_depts, active,
             login_attempts, locked_until
      FROM users WHERE email = ${email.toLowerCase().trim()} LIMIT 1
    `;
    const user = rows[0];

    if (!user || !user.active) {
      await logAuth(null, email, 'login_fail', `Email nao encontrado ou inativo (IP: ${ip})`);
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remaining = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      await logAuth(user.id, email, 'login_blocked', `Conta bloqueada. Tentativa de IP: ${ip}`);
      return res.status(429).json({
        error: `Conta bloqueada por excesso de tentativas. Tente novamente em ${remaining} minuto(s).`
      });
    }

    const valid = await bcrypt.compare(password, user.pwd_hash);

    if (!valid) {
      const attempts = (user.login_attempts || 0) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
        await sql`UPDATE users SET login_attempts = ${attempts}, locked_until = ${lockedUntil} WHERE id = ${user.id}`;
        await logAuth(user.id, email, 'login_locked', `Conta bloqueada apos ${attempts} tentativas. IP: ${ip}`);
        return res.status(429).json({
          error: `Conta bloqueada por ${LOCK_MINUTES} minutos apos ${MAX_ATTEMPTS} tentativas incorretas.`
        });
      }
      await sql`UPDATE users SET login_attempts = ${attempts} WHERE id = ${user.id}`;
      await logAuth(user.id, email, 'login_fail', `Senha incorreta. Tentativa ${attempts}/${MAX_ATTEMPTS}. IP: ${ip}`);
      return res.status(401).json({
        error: `Email ou senha incorretos. Tentativa ${attempts} de ${MAX_ATTEMPTS}.`
      });
    }

    // Login bem-sucedido
    await sql`UPDATE users SET login_attempts = 0, locked_until = null WHERE id = ${user.id}`;
    await logAuth(user.id, email, 'login_ok', `Login bem-sucedido. IP: ${ip}`);

    // Buscar permissões e grupos do usuário
    const [permissions, userRoles] = await Promise.all([
      getUserPermissions(sql, user.id),
      getUserRoles(sql, user.id)
    ]);

    // Fallback: se usuário ainda não tem grupo atribuído, usa role antiga
    const effectivePermissions = permissions.length > 0
      ? permissions
      : getFallbackPermissions(user.role);

    const userPayload = {
      id: user.id, name: user.name, email: user.email,
      area: user.area, role: user.role,
      evalDepts: user.eval_depts || [],
      permissions: effectivePermissions,
      roles: userRoles.map(r => ({ id: r.id, name: r.name }))
    };

    const token = signToken(userPayload);
    return res.json({ token, user: userPayload });

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// Fallback enquanto migração não foi executada
function getFallbackPermissions(role) {
  const map = {
    admin: [
      'dashboard','changes','detail','acoes','indicators',
      'crits','perguntas','settings','matrix','users','log',
      'sa.criar','sa.cancelar','sa.ver_todas','sa.anexar',
      'triagem.executar','triagem.aprovar',
      'avaliacao.responder','avaliacao.revisar','avaliacao.reatribuir',
      'plano.montar','plano.aprovar','plano.atribuir_resp',
      'acao.concluir','acao.solicitar_ext',
      'prazo.aprovar_ext','prazo.alterar_direto',
      'config.criticidades','config.perguntas','config.matriz','config.prazos',
      'usuarios.gerenciar','usuarios.importar','grupos.gerenciar','auditoria.ver'
    ],
    sgq: [
      'dashboard','changes','detail','acoes','indicators',
      'crits','perguntas','settings','matrix','log',
      'sa.criar','sa.cancelar','sa.ver_todas','sa.anexar',
      'triagem.executar','triagem.aprovar',
      'avaliacao.responder','avaliacao.revisar','avaliacao.reatribuir',
      'plano.montar','plano.aprovar','plano.atribuir_resp',
      'acao.concluir','acao.solicitar_ext',
      'prazo.aprovar_ext',
      'config.criticidades','config.perguntas','config.matriz','config.prazos',
      'auditoria.ver'
    ],
  };
  return map[role] || [
    'dashboard','changes','detail','acoes','indicators','settings',
    'sa.criar','sa.anexar','sa.ver_todas',
    'avaliacao.responder','acao.concluir','acao.solicitar_ext'
  ];
}

async function logAuth(userId, email, type, detail) {
  try {
    await sql`
      INSERT INTO syslog (user_id, user_email, type, detail, created_at)
      VALUES (${userId}, ${email}, ${type}, ${detail}, now())
    `;
  } catch (e) {
    console.warn('logAuth error:', e.message);
  }
}
