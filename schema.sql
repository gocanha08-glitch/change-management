-- ================================================================
-- SCHEMA — Change Management System
-- Execute this in Neon SQL Editor to initialize the database
-- ================================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  area        TEXT DEFAULT '',
  role        TEXT NOT NULL DEFAULT 'geral',  -- admin | sgq | geral
  pwd_hash    TEXT NOT NULL,
  eval_depts  JSONB DEFAULT '[]',
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  created_by  TEXT DEFAULT ''
);

-- System config table (matrix, crits, phase deadlines, dept questions)
CREATE TABLE IF NOT EXISTS config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  updated_by  TEXT DEFAULT ''
);

-- Requests (SAs) table — full JSON blob per SA
CREATE TABLE IF NOT EXISTS requests (
  id          TEXT PRIMARY KEY,          -- e.g. SA-001/2025
  data        JSONB NOT NULL,            -- full SA object
  status      TEXT NOT NULL DEFAULT 'aberta',
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- System log table
CREATE TABLE IF NOT EXISTS syslog (
  id          SERIAL PRIMARY KEY,
  at          TIMESTAMPTZ DEFAULT now(),
  by          TEXT NOT NULL,
  type        TEXT NOT NULL,
  event       TEXT NOT NULL,
  detail      TEXT DEFAULT ''
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_created_by ON requests(created_by);
CREATE INDEX IF NOT EXISTS idx_syslog_at ON syslog(at DESC);

-- ================================================================
-- SEED: initial admin user (password: Admin@123)
-- bcrypt hash of "Admin@123"
-- ================================================================
INSERT INTO users (name, email, area, role, pwd_hash, eval_depts, active, created_by)
VALUES (
  'Ana Paula Silva',
  'ana@empresa.com',
  'SGQ',
  'admin',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 
  '[]',
  true,
  'system'
) ON CONFLICT (email) DO NOTHING;

-- NOTE: The hash above is a placeholder. Run the app once and use
-- the /api/setup endpoint to create the real admin with proper hash.
