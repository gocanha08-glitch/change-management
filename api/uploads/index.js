


const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { requireAuth } = require('../../lib/auth');

const CORS = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

module.exports = async (req, res) => {
  CORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;

  // POST — gera URL para upload
  if (req.method === 'POST') {
    const { filename, contentType, refId, refType } = req.body || {};
    if (!filename || !contentType) return res.status(400).json({ error: 'filename e contentType obrigatorios' });

    const key = `${refType}/${refId}/${Date.now()}_${filename}`;
    const command = new PutObjectCommand({
      Bucket: 'change-management',
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
    return res.json({ uploadUrl, key });
  }

  // GET — gera URL para download
  if (req.method === 'GET') {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: 'key obrigatoria' });

    const command = new GetObjectCommand({
      Bucket: 'change-management',
      Key: key,
    });

    const downloadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
    return res.json({ downloadUrl });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
