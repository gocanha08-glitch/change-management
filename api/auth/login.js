// api/auth/login.js
const { sql } = require('../../lib/db');
const { signToken } = require('../../lib/auth');
const bcrypt = require('bcryptjs');

const MAX_ATTEMPTS = 5;       // tentativas antes de bloquear
const LOCK_MINUTES = 15;      // minutos de bloqueio

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

    // Usuário não encontrado — resposta genérica para não revelar existência
    if (!user || !user.active) {
      await logAuth(null, email, 'login_fail', `Email nao encontrado ou inativo (IP: ${ip})`);
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    // Verificar bloqueio temporário
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remaining = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      await logAuth(user.id, email, 'login_blocked', `Conta bloqueada. Tentativa de IP: ${ip}`);
      return res.status(429).json({
        error: `Conta bloqueada por excesso de tentativas. Tente novamente em ${remaining} minuto(s).`
      });
    }

    // Verificar senha
    const valid = await bcrypt.compare(password, user.pwd_hash);

    if (!valid) {
      const attempts = (user.login_attempts || 0) + 1;

      if (attempts >= MAX_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
        await sql`
          UPDATE users SET login_attempts = ${attempts}, locked_until = ${lockedUntil}
          WHERE id = ${user.id}
        `;
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

    // Login bem-sucedido — resetar contador
    await sql`UPDATE users SET login_attempts = 0, locked_until = null WHERE id = ${user.id}`;
    await logAuth(user.id, email, 'login_ok', `Login bem-sucedido. IP: ${ip}`);

    const token = signToken(user);
    return res.json({
      token,
      user: {
        id: user.id, name: user.name, email: user.email,
        area: user.area, role: user.role, evalDepts: user.eval_depts || []
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

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
