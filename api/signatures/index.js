// api/signatures/index.js
// Retorna auditoria de assinaturas eletrônicas (GAMP 5 / 21 CFR Part 11)
// Apenas usuários com permissão auditoria.ver ou sa.avaliacao_inicial

const { verifyToken } = require('../../lib/auth');
const { hasPermission } = require('../../lib/permissions');
const { query } = require('../../lib/db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Não autenticado' });

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }

  if (!hasPermission(decoded, 'auditoria.ver') && !hasPermission(decoded, 'sa.avaliacao_inicial')) {
    return res.status(403).json({ error: 'Sem permissão' });
  }

  const { sa_id, from, to, action, limit = 200 } = req.query;

  let sql = `SELECT id, sa_id, action, action_detail, signed_by, signed_at, ip_address, meaning, hash
             FROM signatures WHERE 1=1`;
  const params = [];

  if (sa_id) { params.push(sa_id); sql += ` AND sa_id = $${params.length}`; }
  if (from)  { params.push(from);  sql += ` AND signed_at >= $${params.length}`; }
  if (to)    { params.push(to + 'T23:59:59Z'); sql += ` AND signed_at <= $${params.length}`; }
  if (action){ params.push(action); sql += ` AND action = $${params.length}`; }

  sql += ` ORDER BY signed_at DESC LIMIT $${params.length + 1}`;
  params.push(Math.min(parseInt(limit) || 200, 500));

  const { rows } = await query(sql, params);
  return res.status(200).json(rows);
};
