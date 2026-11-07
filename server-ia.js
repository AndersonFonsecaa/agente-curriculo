require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ dest: 'uploads/', limits: { fileSize: 15 * 1024 * 1024 } });
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// Configuração IA
const IA_PROVIDER = process.env.IA_PROVIDER || 'openai';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

let openai = null, anthropic = null, google = null;

if (OPENAI_API_KEY) {
  const { OpenAI } = require('openai');
  openai = new OpenAI({ apiKey: OPENAI_API_KEY });
}
if (ANTHROPIC_API_KEY) {
  const Anthropic = require('@anthropic-ai/sdk');
  anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
}
if (GOOGLE_API_KEY) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  google = new GoogleGenerativeAI(GOOGLE_API_KEY);
}

/** Extrai texto de arquivo */
async function extrairTexto(caminho, mime) {
  const ext = path.extname(caminho).toLowerCase();
  if (ext === '.pdf' || mime === 'application/pdf') {
    const data = await pdf(fs.readFileSync(caminho));
    return data.text;
  }
  if (ext === '.docx' || mime.includes('wordprocessingml')) {
    const r = await mammoth.extractRawText({ path: caminho });
    return r.value;
  }
  if (ext === '.txt' || mime === 'text/plain') {
    return fs.readFileSync(caminho, 'utf8');
  }
  throw new Error('Formato não suportado: ' + ext);
}

/** Chama a IA para análise e geração */
async function chamarIA(vaga, curriculo) {
  const prompt = `
Você é um especialista em recrutamento e carreira. Analise a vaga e o currículo abaixo.

VAGA DE EMPREGO:
${vaga}

CURRÍCULO DO CANDIDATO:
${curriculo}

TAREFAS:
1. Calcule o percentual de match (0-100) considerando habilidades, experiência, educação e requisitos.
2. Liste pontos fortes, lacunas e recomendações.
3. Gere um CURRÍCULO PERSONALIZADO otimizado para esta vaga (reescreva resumo, destaque experiências relevantes, ajuste palavras-chave, reordene habilidades).

Retorne APENAS JSON válido:
{
  "scoreMatch": numero (0-100),
  "analise": {
    "pontosFortes": [string],
    "lacunas": [string],
    "recomendacoes": [string]
  },
  "curriculoPersonalizado": {
    "nome": string,
    "resumoProfissional": string,
    "experiencias": [{ "empresa": string, "cargo": string, "periodo": string, "descricao": string, "realizacoes": [string] }],
    "educacao": [{ "instituicao": string, "curso": string, "periodo": string }],
    "habilidades": [string],
    "contato": { "email": string, "telefone": string, "localizacao": string, "linkedin": string }
  }
}
`;

  if (IA_PROVIDER === 'openai' && openai) {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 4000,
    });
    return extrairJSON(r.choices[0].message.content);
  }

  if (IA_PROVIDER === 'anthropic' && anthropic) {
    const r = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 4000,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });
    return extrairJSON(r.content[0].text);
  }

  if (IA_PROVIDER === 'google' && google) {
    const model = google.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const r = await model.generateContent(prompt);
    return extrairJSON(r.response.text());
  }

  throw new Error('Nenhuma chave de IA configurada. Defina IA_PROVIDER e a respectiva API_KEY no .env');
}

function extrairJSON(texto) {
  try {
    const ini = texto.indexOf('{');
    const fim = texto.lastIndexOf('}');
    if (ini === -1 || fim === -1) throw new Error('JSON não encontrado na resposta da IA');
    return JSON.parse(texto.substring(ini, fim + 1));
  } catch (e) {
    const limpo = texto.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(limpo);
  }
}

/** Gera HTML do currículo */
function gerarHTML(dados) {
  const c = dados.curriculoPersonalizado;
  const exp = c.experiencias.map(e => `
    <div class="experiencia">
      <div class="exp-header"><span class="cargo">${esc(e.cargo)}</span><span class="periodo">${esc(e.periodo)}</span></div>
      <div class="empresa">${esc(e.empresa)}</div>
      <p>${esc(e.descricao)}</p>
      ${e.realizacoes && e.realizacoes.length ? `<ul class="realizacoes">${e.realizacoes.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
    </div>
  `).join('');
  const edu = c.educacao.map(e => `<div class="educacao"><div><strong>${esc(e.curso)}</strong> - ${esc(e.instituicao)}</div><div class="periodo">${esc(e.periodo)}</div></div>`).join('');
  const skills = c.habilidades.map(h => `<span class="skill">${esc(h)}</span>`).join('');
  const cor = dados.scoreMatch >= 70 ? '#10b981' : dados.scoreMatch >= 50 ? '#f59e0b' : '#ef4444';
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Currículo - ${esc(c.nome)}</title>
  <style>body{font-family:'Segoe UI',Tahoma,sans-serif;color:#333;line-height:1.6;font-size:11px;margin:0;padding:20px}header{text-align:center;border-bottom:3px solid #2563eb;padding-bottom:20px;margin-bottom:25px}h1{color:#1e40af;margin:0 0 10px 0;font-size:26px}.contato{display:flex;justify-content:center;gap:15px;font-size:12px;color:#666;flex-wrap:wrap}h2{color:#2563eb;font-size:15px;border-bottom:2px solid #e5e7eb;padding-bottom:5px;margin-top:25px;margin-bottom:15px;text-transform:uppercase;letter-spacing:1px}.resumo{background:#f8fafc;padding:15px;border-radius:8px;border-left:4px solid #2563eb;margin-bottom:20px;text-align:justify}.experiencia{margin-bottom:20px}.exp-header{display:flex;justify-content:space-between;margin-bottom:5px}.cargo{font-weight:bold;color:#1e40af}.periodo{color:#6b7280;font-size:10px}.empresa{font-weight:bold;margin-bottom:5px;color:#374151}.realizacoes{margin:8px 0 0 20px;padding:0}.realizacoes li{margin-bottom:4px}.educacao{margin-bottom:15px}.habilidades{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.skill{background:#e0e7ff;color:#1e40af;padding:4px 10px;border-radius:16px;font-size:10px;font-weight:600}.score-badge{display:inline-block;background:${cor};color:white;padding:6px 16px;border-radius:20px;font-weight:bold;font-size:14px;margin-top:10px}</style></head><body>
  <header><h1>${esc(c.nome)}</h1><div class="contato"><span>📧 ${esc(c.contato.email)}</span><span>📞 ${esc(c.contato.telefone)}</span><span>📍 ${esc(c.contato.localizacao)}</span><span>🔗 ${esc(c.contato.linkedin)}</span></div><div class="score-badge">Match com a vaga: ${dados.scoreMatch}%</div></header>
  <section><h2>Resumo Profissional</h2><div class="resumo">${esc(c.resumoProfissional)}</div></section>
  <section><h2>Experiência Profissional</h2>${exp}</section>
  <section><h2>Educação</h2>${edu}</section>
  <section><h2>Habilidades</h2><div class="habilidades">${skills}</div></section>
  </body></html>`;
}

function esc(t){if(!t)return'';return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}

/** Rota principal */
app.post('/api/analisar', upload.fields([{name:'curriculo',maxCount:1},{name:'vagaArquivo',maxCount:1}]), async (req,res)=>{
  try {
    let textoVaga = req.body.textoVaga || '';
    let textoCurriculo = '';

    if (!req.files || !req.files.curriculo) return res.status(400).json({erro:'Currículo não enviado'});
    textoCurriculo = await extrairTexto(req.files.curriculo[0].path, req.files.curriculo[0].mimetype);

    if (req.files.vagaArquivo && req.files.vagaArquivo[0]) {
      textoVaga = await extrairTexto(req.files.vagaArquivo[0].path, req.files.vagaArquivo[0].mimetype);
    }
    if (!textoVaga.trim() || !textoCurriculo.trim()) return res.status(400).json({erro:'Vaga ou currículo vazios'});

    const resultado = await chamarIA(textoVaga, textoCurriculo);
    const html = gerarHTML(resultado);
    const htmlPath = path.join(__dirname,'uploads',`curriculo_${Date.now()}.html`);
    fs.writeFileSync(htmlPath, html);

    res.json({ scoreMatch: resultado.scoreMatch, analise: resultado.analise, curriculoPersonalizado: resultado.curriculoPersonalizado, htmlCurriculo: html, downloadUrl: `/download/${path.basename(htmlPath)}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({erro: e.message});
  }
});

app.get('/download/:arquivo', (req,res)=>{
  const c = path.join(__dirname,'uploads',req.params.arquivo);
  if (fs.existsSync(c)) res.download(c); else res.status(404).json({erro:'Não encontrado'});
});

app.get('/api/status', (req,res)=>{
  res.json({ provider: IA_PROVIDER, temIA: !!(openai||anthropic||google), status: 'online' });
});

app.listen(PORT, ()=>console.log(`Servidor IA rodando em http://localhost:${PORT}\nProvedor: ${IA_PROVIDER}`));