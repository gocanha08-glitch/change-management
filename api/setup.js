// api/setup.js — one-time setup: creates tables + first admin
// DELETE THIS FILE after first run for security!
const { sql } = require('../lib/db');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Simple protection: require a setup token
  const token = req.query.token || req.body?.token;
  if (token !== process.env.SETUP_TOKEN) {
    return res.status(403).json({ error: 'Token invalido. Set SETUP_TOKEN env var.' });
  }

  try {
    // Create tables
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id          SERIAL PRIMARY KEY,
        name        TEXT NOT NULL,
        email       TEXT UNIQUE NOT NULL,
        area        TEXT DEFAULT '',
        role        TEXT NOT NULL DEFAULT 'geral',
        pwd_hash    TEXT NOT NULL,
        eval_depts  JSONB DEFAULT '[]',
        active      BOOLEAN DEFAULT true,
        created_at  TIMESTAMPTZ DEFAULT now(),
        created_by  TEXT DEFAULT ''
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS config (
        key         TEXT PRIMARY KEY,
        value       JSONB NOT NULL,
        updated_at  TIMESTAMPTZ DEFAULT now(),
        updated_by  TEXT DEFAULT ''
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS requests (
        id          TEXT PRIMARY KEY,
        data        JSONB NOT NULL,
        status      TEXT NOT NULL DEFAULT 'aberta',
        created_by  INTEGER,
        created_at  TIMESTAMPTZ DEFAULT now(),
        updated_at  TIMESTAMPTZ DEFAULT now()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS syslog (
        id          SERIAL PRIMARY KEY,
        at          TIMESTAMPTZ DEFAULT now(),
        by          TEXT NOT NULL,
        type        TEXT NOT NULL,
        event       TEXT NOT NULL,
        detail      TEXT DEFAULT ''
      )
    `;

    await sql`CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_syslog_at ON syslog(at DESC)`;

    // Create initial admin user
    const adminPwd = req.query.pwd || 'Admin@123';
    const hash = await bcrypt.hash(adminPwd, 10);

    await sql`
      INSERT INTO users (name, email, area, role, pwd_hash, eval_depts, active, created_by)
      VALUES ('Admin', ${req.query.email || 'admin@empresa.com'}, 'SGQ', 'admin', ${hash}, '[]', true, 'setup')
      ON CONFLICT (email) DO UPDATE SET pwd_hash = EXCLUDED.pwd_hash
    `;

    return res.json({
      ok: true,
      message: 'Setup concluido! Tabelas criadas e admin configurado.',
      admin_email: req.query.email || 'admin@empresa.com',
      admin_pwd: adminPwd,
      warning: 'DELETE api/setup.js after this!'
    });
  } catch (err) {
    console.error('Setup error:', err);
    return res.status(500).json({ error: err.message });
  }
};
