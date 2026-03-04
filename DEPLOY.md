# CHANGE v10 — Deploy no Vercel + Neon
## Guia passo a passo

---

## 1. Criar banco de dados no Neon

1. Acesse **neon.tech** e crie uma conta gratuita
2. Clique em **"New Project"** → escolha um nome (ex: `change-management`)
3. Região: escolha a mais próxima do Brasil (ex: `AWS us-east-1`)
4. Após criar, vá em **"Connection Details"**
5. Copie a **Connection String** — vai ser algo assim:
   ```
   postgresql://user:senha@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```
6. Guarde essa string — é a `DATABASE_URL`

---

## 2. Fazer deploy no Vercel

### Opção A — Via GitHub (recomendado)
1. Crie uma conta em **vercel.com**
2. Crie um repositório no GitHub e suba a pasta `change-app/`:
   ```bash
   cd change-app
   git init
   git add .
   git commit -m "initial deploy"
   git remote add origin https://github.com/SEU_USUARIO/change-app.git
   git push -u origin main
   ```
3. No Vercel: **"Add New Project"** → conecte o GitHub → selecione o repositório
4. Clique em **Deploy**

### Opção B — Via Vercel CLI
```bash
npm install -g vercel
cd change-app
vercel login
vercel --prod
```

---

## 3. Configurar variáveis de ambiente no Vercel

No painel do Vercel, vá em **Settings → Environment Variables** e adicione:

| Nome             | Valor                        |
|------------------|------------------------------|
| `DATABASE_URL`   | (a connection string do Neon)|
| `JWT_SECRET`     | (qualquer string longa aleatória, ex: `minha-chave-super-secreta-2025`) |
| `SETUP_TOKEN`    | (uma senha para o setup, ex: `setup123`) |

---

## 4. Inicializar o banco de dados

Após o deploy, acesse no navegador:
```
https://SEU-APP.vercel.app/api/setup?token=setup123&email=admin@suaempresa.com&pwd=SuaSenha@123
```

Substitua:
- `setup123` → seu SETUP_TOKEN
- `admin@suaempresa.com` → email do primeiro admin
- `SuaSenha@123` → senha inicial (min 6 chars, 1 maiúscula, 1 número, 1 especial)

Se aparecer `"ok": true` → banco configurado com sucesso!

> ⚠️ **IMPORTANTE**: Após o setup, delete o arquivo `api/setup.js` e faça um novo deploy para segurança.

---

## 5. Acessar o sistema

Acesse: `https://SEU-APP.vercel.app`

Login inicial:
- **Email**: o que você passou no setup
- **Senha**: a que você passou no setup

---

## 6. Adicionar usuários

1. Logue como Admin
2. Vá em **Usuarios** na sidebar
3. Use **"+ Novo"** para cadastro unitário ou **"↑ Importar Excel"** para importação em lote

---

## Estrutura do projeto

```
change-app/
├── vercel.json          ← configuração do Vercel
├── package.json         ← dependências Node.js
├── schema.sql           ← SQL de referência (já executado pelo /api/setup)
├── lib/
│   ├── db.js            ← conexão com Neon
│   └── auth.js          ← JWT helpers
├── api/
│   ├── setup.js         ← inicialização (deletar após usar!)
│   ├── auth/
│   │   └── login.js     ← POST /api/auth/login
│   ├── requests/
│   │   ├── index.js     ← GET/POST /api/requests
│   │   └── [id].js      ← GET/PUT /api/requests/:id
│   ├── users/
│   │   └── index.js     ← GET/POST/PUT /api/users
│   └── config/
│       └── [key].js     ← GET/PUT /api/config/:key
└── public/
    └── index.html       ← frontend completo (211 KB)
```

---

## Custos estimados

| Serviço | Plano Free         | Limite                          |
|---------|--------------------|---------------------------------|
| Vercel  | Hobby (gratuito)   | 100GB banda/mês, deployments ilimitados |
| Neon    | Free Tier          | 0.5 GB storage, 100h compute/mês |

Para uso corporativo inicial com ~20 usuários: **gratuito nos dois**.

---

## Problemas comuns

**"Erro de conexão" no login**
→ Verifique se `DATABASE_URL` está configurado no Vercel

**"Token invalido" no setup**
→ Verifique se `SETUP_TOKEN` bate com o que você passou na URL

**Página em branco**
→ Abra DevTools (F12) → Console para ver o erro

**Dados não aparecem após login**
→ Verifique se o setup foi executado com sucesso (tabelas criadas)
