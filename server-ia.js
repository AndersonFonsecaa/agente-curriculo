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
const IA_PROVIDER = process.env.IA_PROVIDER || 'groq';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

let openai = null, anthropic = null, google = null, groq = null;

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
if (GROQ_API_KEY) {
  const { OpenAI } = require('openai');
  groq = new OpenAI({
    apiKey: GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1'
  });
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

/** Chama a IA para análise completa */
async function chamarIA(vaga, curriculo) {
  const prompt = `
Você é um especialista sênior em recrutamento, headhunter e coach de carreira. Analise profundamente a vaga e o currículo abaixo.

VAGA DE EMPREGO:
${vaga}

CURRÍCULO DO CANDIDATO:
${curriculo}

TAREFAS - Retorne APENAS um JSON válido com ESTA ESTRUTURA EXATA:

{
  "scoreMatch": numero inteiro 0-100 (match geral),
  "analise": {
    "pontosFortes": [lista de strings com os principais pontos fortes],
    "lacunas": [lista de strings com o que falta],
    "recomendacoes": [lista de strings com recomendações práticas],
    "matchDetalhado": {
      "habilidadesTecnicas": numero 0-100,
      "experiencia": numero 0-100,
      "educacao": numero 0-100,
      "softSkills": numero 0-100,
      "ats": numero 0-100
    },
    "roadmapGaps": [
      {
        "gap": "nome da habilidade/ferramenta faltante",
        "sugestao": "curso ou ação específica para preencher",
        "link": "URL do curso/recurso (ou string vazia)"
      }
    ]
  },
  "cartaApresentacao": "texto completo da carta de apresentação personalizada para esta vaga, em português, profissional, conectando a experiência do candidato aos requisitos da vaga",
  "entrevista": {
    "perguntas": [
      {
        "pergunta": "pergunta provável da entrevista",
        "respostaSugerida": "resposta baseada na experiência real do currículo",
        "dica": "dica de como responder bem"
      }
    ]
  },
  "checklistAplicacao": [lista de strings com checklist antes de enviar],
  "curriculoPersonalizado": {
    "nome": string,
    "contato": { "email": string, "telefone": string, "localizacao": string, "linkedin": string },
    "resumoProfissional": string,
    "experiencias": [{ "empresa": string, "cargo": string, "periodo": string, "descricao": string, "realizacoes": [string] }],
    "educacao": [{ "instituicao": string, "curso": string, "periodo": string }],
    "habilidades": [string]
  }
}

INSTRUÇÕES IMPORTANTES:
- Seja preciso e específico. Use dados reais do currículo.
- O matchDetalhado deve refletir a realidade: se o currículo não tem AWS, habilidadesTecnicas deve ser menor.
- A cartaApresentacao deve ser pronta para copiar e colar.
- As perguntas de entrevista devem ser específicas para esta vaga.
- O roadmapGaps deve sugerir cursos gratuitos quando possível.
- Retorne APENAS o JSON, sem markdown, sem texto antes ou depois.
`;

  if (IA_PROVIDER === 'openai' && openai) {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 6000,
    });
    return extrairJSON(r.choices[0].message.content);
  }

  if (IA_PROVIDER === 'anthropic' && anthropic) {
    const r = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 6000,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });
    return extrairJSON(r.content[0].text);
  }

  if (IA_PROVIDER === 'google' && google) {
    const model = google.getGenerativeModel({ model: 'gemini-1.5-pro-latest' });
    const r = await model.generateContent(prompt);
    return extrairJSON(r.response.text());
  }

  if (IA_PROVIDER === 'groq' && groq) {
    const r = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 6000,
    });
    return extrairJSON(r.choices[0].message.content);
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

function esc(t) {
  if (!t) return '';
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Gera HTML completo do currículo */
function gerarHTMLCurriculo(c) {
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
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Currículo - ${esc(c.nome)}</title>
  <style>body{font-family:'Segoe UI',Tahoma,sans-serif;color:#333;line-height:1.6;font-size:11px;margin:0;padding:20px}header{text-align:center;border-bottom:3px solid #2563eb;padding-bottom:20px;margin-bottom:25px}h1{color:#1e40af;margin:0 0 10px 0;font-size:26px}.contato{display:flex;justify-content:center;gap:15px;font-size:12px;color:#666;flex-wrap:wrap}h2{color:#2563eb;font-size:15px;border-bottom:2px solid #e5e7eb;padding-bottom:5px;margin-top:25px;margin-bottom:15px;text-transform:uppercase;letter-spacing:1px}.resumo{background:#f8fafc;padding:15px;border-radius:8px;border-left:4px solid #2563eb;margin-bottom:20px;text-align:justify}.experiencia{margin-bottom:20px}.exp-header{display:flex;justify-content:space-between;margin-bottom:5px}.cargo{font-weight:bold;color:#1e40af}.periodo{color:#6b7280;font-size:10px}.empresa{font-weight:bold;margin-bottom:5px;color:#374151}.realizacoes{margin:8px 0 0 20px;padding:0}.realizacoes li{margin-bottom:4px}.educacao{margin-bottom:15px}.habilidades{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.skill{background:#e0e7ff;color:#1e40af;padding:4px 10px;border-radius:16px;font-size:10px;font-weight:600}</style></head><body>
  <header><h1>${esc(c.nome)}</h1><div class="contato"><span>📧 ${esc(c.contato.email)}</span><span>📞 ${esc(c.contato.telefone)}</span><span>📍 ${esc(c.contato.localizacao)}</span><span>🔗 ${esc(c.contato.linkedin)}</span></div></header>
  <section><h2>Resumo Profissional</h2><div class="resumo">${esc(c.resumoProfissional)}</div></section>
  <section><h2>Experiência Profissional</h2>${exp}</section>
  <section><h2>Educação</h2>${edu}</section>
  <section><h2>Habilidades</h2><div class="habilidades">${skills}</div></section>
  </body></html>`;
}

/** Rota principal */
app.post('/api/analisar', upload.fields([{ name: 'curriculo', maxCount: 1 }, { name: 'vagaArquivo', maxCount: 1 }]), async (req, res) => {
  try {
    let textoVaga = req.body.textoVaga || '';
    let textoCurriculo = '';

    if (!req.files || !req.files.curriculo) return res.status(400).json({ erro: 'Currículo não enviado' });
    textoCurriculo = await extrairTexto(req.files.curriculo[0].path, req.files.curriculo[0].mimetype);

    if (req.files.vagaArquivo && req.files.vagaArquivo[0]) {
      textoVaga = await extrairTexto(req.files.vagaArquivo[0].path, req.files.vagaArquivo[0].mimetype);
    }
    if (!textoVaga.trim() || !textoCurriculo.trim()) return res.status(400).json({ erro: 'Vaga ou currículo vazios' });

    const resultado = await chamarIA(textoVaga, textoCurriculo);

    // Gera HTML do currículo
    const htmlCurriculo = gerarHTMLCurriculo(resultado.curriculoPersonalizado);

    res.json({
      scoreMatch: resultado.scoreMatch,
      analise: resultado.analise,
      cartaApresentacao: resultado.cartaApresentacao,
      entrevista: resultado.entrevista,
      checklistAplicacao: resultado.checklistAplicacao,
      curriculoPersonalizado: resultado.curriculoPersonalizado,
      htmlCurriculo: htmlCurriculo
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: e.message });
  }
});

app.get('/api/status', (req, res) => {
  res.json({ provider: IA_PROVIDER, temIA: !!(openai || anthropic || google), status: 'online' });
});

app.listen(PORT, () => console.log(`Servidor IA Avançado rodando em http://localhost:${PORT}\nProvedor: ${IA_PROVIDER}`));