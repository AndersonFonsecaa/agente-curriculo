# 🚀 Guia de Deploy - Agente de Currículo com IA

## Opção 1: Render.com (RECOMENDADO - Grátis)

### Passo a passo:

1. **Crie uma conta** em [render.com](https://render.com) (grátis)

2. **Conecte seu repositório GitHub** ou faça upload direto dos arquivos

3. **Crie um novo Web Service** e aponte para a pasta `agente-curriculo`

4. **Configure as variáveis de ambiente** no dashboard do Render:

   | Variável | Valor |
   |----------|-------|
   | `IA_PROVIDER` | `openai` (ou `anthropic` / `google`) |
   | `OPENAI_API_KEY` | `sk-sua-chave-aqui` |
   | `PORT` | `3001` |

5. **Deploy automático** - o Render detecta o `render.yaml` e configura tudo sozinho

6. **Acesse** a URL gerada (ex: `https://agente-curriculo-ia.onrender.com`)

---

## Opção 2: Railway.app (Grátis / Pai por uso)

1. **Crie uma conta** em [railway.app](https://railway.app)

2. **Clique em "New Project"** → "Deploy from GitHub repo"

3. **Selecione o repositório** com o projeto

4. **Adicione as variáveis de ambiente** na aba "Variables":

   ```
   IA_PROVIDER=openai
   OPENAI_API_KEY=sk-sua-chave-aqui
   PORT=3001
   ```

5. **Deploy automático** - Railway detecta o `package.json` e roda `npm start`

---

## Opção 3: Vercel (Serverless)

1. **Crie uma conta** em [vercel.com](https://vercel.com)

2. **Conecte o repositório GitHub**

3. **Configure** as variáveis de ambiente nas configurações do projeto

4. **Deploy** automático

> ⚠️ Nota: o Vercel é serverless, então o servidor não fica rodando o tempo todo. Pode haver "cold start" na primeira requisição.

---

## 🔑 Obter chave de IA

### OpenAI (Recomendado)
1. Acesse [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Faça login e crie uma nova chave secreta
3. Copie a chave (começa com `sk-...`)
4. Cole no `.env` ou nas variáveis de ambiente da plataforma

**Custo:** ~$0.15 por 1 milhão de tokens (muito barato para este uso)

### Anthropic (Claude)
1. Acesse [console.anthropic.com](https://console.anthropic.com/)
2. Crie uma chave de API

### Google (Gemini)
1. Acesse [makersuite.google.com](https://makersuite.google.com/)
2. Gere uma chave de API (tem plano gratuito generoso)

---

## 📋 Checklist antes do deploy

- [ ] Conta criada na plataforma escolhida
- [ ] Chave de IA obtida (OpenAI/Anthropic/Google)
- [ ] Arquivo `.env` configurado localmente para testar
- [ ] Código enviado para GitHub (ou upload direto)
- [ ] Variáveis de ambiente configuradas na plataforma
- [ ] Deploy realizado com sucesso
- [ ] Teste realizado acessando a URL gerada

---

## 🧪 Testar localmente antes do deploy

```bash
# Instalar dependências
npm install

# Copiar exemplo de env
cp .env.example .env

# Editar .env com sua chave de IA
# (use qualquer editor de texto)

# Iniciar servidor
npm start

# Acessar no navegador
# http://localhost:3001
```

---

## 🆘 Problemas comuns

| Problema | Solução |
|----------|---------|
| Erro ao conectar IA | Verifique se a chave da API está correta e tem créditos |
| Porta já em uso | Altere `PORT` no `.env` |
| Arquivo PDF não lê | Verifique se `pdf-parse` está instalado (`npm install`) |
| CORS error | O backend já tem CORS habilitado, verifique a URL do frontend |

---

## 📞 Suporte

Se tiver problemas no deploy, verifique os logs da plataforma (Render/Railway/Vercel) para ver mensagens de erro detalhadas.
