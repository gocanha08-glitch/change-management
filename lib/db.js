// lib/db.js — Neon PostgreSQL connection helper
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);
module.exports = { sql };
