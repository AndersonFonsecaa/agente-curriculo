require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuração do upload de arquivos
const upload = multer({ dest: 'uploads/', limits: { fileSize: 10 * 1024 * 1024 } });

// Garante que a pasta de uploads existe
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Provedor de IA
const IA_PROVIDER = process.env.IA_PROVIDER || 'simulacao';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

let openaiClient = null;
let anthropicClient = null;
let googleClient = null;

if (OPENAI_API_KEY && IA_PROVIDER === 'openai') {
  const { OpenAI } = require('openai');
  openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
}
if (ANTHROPIC_API_KEY && IA_PROVIDER === 'anthropic') {
  const Anthropic = require('@anthropic-ai/sdk');
  anthropicClient = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
}
if (GOOGLE_API_KEY && IA_PROVIDER === 'google') {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  googleClient = new GoogleGenerativeAI(GOOGLE_API_KEY);
}

/**
 * Extrai texto de um arquivo (PDF, DOCX, TXT)
 */
async function extrairTextoArquivo(caminhoArquivo, tipoMime) {
  const extensao = path.extname(caminhoArquivo).toLowerCase();

  if (extensao === '.pdf' || tipoMime === 'application/pdf') {
    const dataBuffer = fs.readFileSync(caminhoArquivo);
    const data = await pdf(dataBuffer);
    return data.text;
  }

  if (extensao === '.docx' || tipoMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ path: caminhoArquivo });
    return result.value;
  }

  if (extensao === '.txt' || tipoMime === 'text/plain') {
    return fs.readFileSync(caminhoArquivo, 'utf8');
  }

  throw new Error(`Tipo de arquivo não suportado: ${extensao}`);
}

/**
 * Chama a IA para analisar match e gerar currículo
 */
async function chamarIA(vaga, curriculo) {
  const prompt = `
Você é um especialista em recrutamento e carreira. Analise a vaga de emprego e o currículo abaixo.

VAGA DE EMPREGO:
${vaga}

CURRÍCULO DO CANDIDATO:
${curriculo}

TAREFAS:
1. Calcule o percentual de match (0 a 100) entre o currículo e a vaga, considerando habilidades, experiência, educação e requisitos.
2. Liste as principais lacunas (gaps) - o que está na vaga mas falta no currículo.
3. Liste os pontos fortes - o que está no currículo e casa bem com a vaga.
4. Gere um CURRÍCULO PERSONALIZADO otimizado para esta vaga, reescrevendo o resumo profissional, destacando as experiências mais relevantes, ajustando palavras-chave e reordenando habilidades por importância para esta vaga específica.

Retorne APENAS um JSON válido com esta estrutura:
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

  if (IA_PROVIDER === 'openai' && openaiClient) {
    const response = await openaiClient.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 3000,
    });
    return extrairJSON(response.choices[0].message.content);
  }

  if (IA_PROVIDER === 'anthropic' && anthropicClient) {
    const response = await anthropicClient.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 3000,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });
    const texto = response.content[0].text;
    return extrairJSON(texto);
  }

  if (IA_PROVIDER === 'google' && googleClient) {
    const model = googleClient.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    return extrairJSON(result.response.text());
  }

  // Modo simulação (sem API) - retorna resultado fictício para teste
  return gerarRespostaSimulada(vaga, curriculo);
}

function extrairJSON(texto) {
  try {
    const inicio = texto.indexOf('{');
    const fim = texto.lastIndexOf('}');
    if (inicio === -1 || fim === -1) throw new Error('JSON não encontrado');
    return JSON.parse(texto.substring(inicio, fim + 1));
  } catch (e) {
    // Fallback: tenta limpar markdown
    const limpo = texto.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(limpo);
  }
}

function gerarRespostaSimulada(vaga, curriculo) {
  // Extrai palavras-chave simples da vaga para simular match
  const palavrasVaga = vaga.toLowerCase().match(/\b\w{4,}\b/g) || [];
  const palavrasCurriculo = curriculo.toLowerCase().match(/\b\w{4,}\b/g) || [];
  const coincidencias = palavrasVaga.filter(p => palavrasCurriculo.includes(p));
  const score = Math.min(95, Math.max(40, Math.round((coincidencias.length / Math.max(palavrasVaga.length, 1)) * 100)));

  return {
    scoreMatch: score,
    analise: {
      pontosFortes: [
        'Experiência relevante identificada no currículo',
        'Formação acadêmica compatível com os requisitos',
        'Habilidades técnicas parciais alinhadas à vaga'
      ],
      lacunas: [
        'Algumas ferramentas específicas da vaga não foram encontradas no currículo',
        'Considere adicionar mais palavras-chave da descrição da vaga'
      ],
      recomendacoes: [
        'Destaque projetos relacionados à vaga no início do currículo',
        'Use as mesmas palavras-chave da vaga em suas experiências',
        'Quantifique resultados com números e porcentagens'
      ]
    },
    curriculoPersonalizado: {
      nome: 'Seu Nome',
      resumoProfissional: 'Profissional com experiência focado em [ÁREA DA VAGA], com sólidos conhecimentos e histórico de entregas relevantes para a posição.',
      experiencias: [
        {
          empresa: 'Empresa Anterior',
          cargo: 'Seu Cargo',
          periodo: '2022 - Presente',
          descricao: 'Responsável por atividades alinhadas aos requisitos da vaga.',
          realizacoes: ['Entrega de projetos relevantes', 'Otimização de processos']
        }
      ],
      educacao: [
        {
          instituicao: 'Sua Instituição',
          curso: 'Seu Curso',
          periodo: 'Concluído'
        }
      ],
      habilidades: ['Comunicação', 'Trabalho em equipe', 'Resolução de problemas'],
      contato: {
        email: 'seu.email@exemplo.com',
        telefone: '(00) 00000-0000',
        localizacao: 'Sua Cidade, UF',
        linkedin: 'linkedin.com/in/seuperfil'
      }
    }
  };
}

/**
 * Gera HTML do currículo personalizado para impressão/PDF
 */
function gerarHTMLCurriculo(dados) {
  const c = dados.curriculoPersonalizado;
  const expHTML = c.experiencias.map(e => `
    <div class="experiencia">
      <div class="exp-header">
        <span class="cargo">${e.cargo}</span>
        <span class="periodo">${e.periodo}</span>
      </div>
      <div class="empresa">${e.empresa}</div>
      <p>${e.descricao}</p>
      ${e.realizacoes && e.realizacoes.length > 0 ? `
        <ul class="realizacoes">
          ${e.realizacoes.map(r => `<li>${r}</li>`).join('')}
        </ul>
      ` : ''}
    </div>
  `).join('');

  const eduHTML = c.educacao.map(e => `
    <div class="educacao">
      <div>${e.curso} - ${e.instituicao}</div>
      <div class="periodo">${e.periodo}</div>
    </div>
  `).join('');

  const skillsHTML = c.habilidades.map(h => `<span class="skill">${h}</span>`).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Currículo Personalizado - ${c.nome}</title>
<style>
  @page { margin: 1.5cm; }
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.6; font-size: 11px; margin: 0; }
  .container { max-width: 800px; margin: 0 auto; padding: 20px; }
  header { text-align: center; border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
  h1 { color: #1e40af; margin: 0 0 10px 0; font-size: 26px; }
  .contato { display: flex; justify-content: center; gap: 20px; font-size: 12px; color: #666; flex-wrap: wrap; }
  .contato span { display: flex; align-items: center; gap: 6px; }
  h2 { color: #2563eb; font-size: 15px; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px; margin-top: 25px; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1px; }
  .resumo { background: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #2563eb; margin-bottom: 20px; font-size: 12px; text-align: justify; }
  .experiencia { margin-bottom: 20px; }
  .exp-header { display: flex; justify-content: space-between; margin-bottom: 5px; }
  .cargo { font-weight: bold; color: #1e40af; }
  .periodo { color: #6b7280; font-size: 10px; }
  .empresa { font-weight: bold; margin-bottom: 5px; color: #374151; }
  .realizacoes { margin: 8px 0 0 20px; padding: 0; }
  .realizacoes li { margin-bottom: 4px; }
  .educacao { margin-bottom: 15px; }
  .habilidades { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .skill { background: #e0e7ff; color: #1e40af; padding: 4px 10px; border-radius: 16px; font-size: 10px; font-weight: 600; }
  .score-badge { display: inline-block; background: ${dados.scoreMatch >= 70 ? '#10b981' : dados.scoreMatch >= 50 ? '#f59e0b' : '#ef4444'}; color: white; padding: 6px 16px; border-radius: 20px; font-weight: bold; font-size: 14px; margin-top: 10px; }
  .gap-list { font-size: 11px; color: #666; margin-top: 15px; }
  .gap-list strong { color: #374151; }
  @media print {
    body { -webkit-print-color-adjust: exact; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>${c.nome}</h1>
    <div class="contato">
      <span>📧 ${c.contato.email}</span>
      <span>📞 ${c.contato.telefone}</span>
      <span>📍 ${c.contato.localizacao}</span>
      <span>🔗 ${c.contato.linkedin}</span>
    </div>
    <div class="score-badge">Match com a vaga: ${dados.scoreMatch}%</div>
  </header>

  <section>
    <h2>Resumo Profissional</h2>
    <div class="resumo">${c.resumoProfissional}</div>
  </section>

  <section>
    <h2>Experiência Profissional</h2>
    ${expHTML}
  </section>

  <section>
    <h2>Educação</h2>
    ${eduHTML}
  </section>

  <section>
    <h2>Habilidades</h2>
    <div class="habilidades">${skillsHTML}</div>
  </section>

  <section class="gap-list no-print">
    <strong>Análise de Match:</strong><br>
    Pontos fortes: ${dados.analise.pontosFortes.join(', ')}<br>
    Lacunas: ${dados.analise.lacunas.join(', ')}<br>
    Recomendações: ${dados.analise.recomendacoes.join(', ')}
  </section>
</div>
</body>
</html>`;
}

// ROTAS

app.post('/api/analisar', upload.fields([
  { name: 'curriculo', maxCount: 1 },
  { name: 'vagaArquivo', maxCount: 1 }
]), async (req, res) => {
  try {
    let textoVaga = req.body.textoVaga || '';
    let textoCurriculo = '';

    // Processa currículo (arquivo obrigatório)
    if (!req.files || !req.files.curriculo) {
      return res.status(400).json({ erro: 'Currículo não enviado' });
    }

    const arquivoCurriculo = req.files.curriculo[0];
    textoCurriculo = await extrairTextoArquivo(arquivoCurriculo.path, arquivoCurriculo.mimetype);

    // Processa vaga (texto ou arquivo)
    if (req.files.vagaArquivo && req.files.vagaArquivo[0]) {
      const arquivoVaga = req.files.vagaArquivo[0];
      textoVaga = await extrairTextoArquivo(arquivoVaga.path, arquivoVaga.mimetype);
    }

    if (!textoVaga.trim() || !textoCurriculo.trim()) {
      return res.status(400).json({ erro: 'Vaga ou currículo vazios' });
    }

    // Chama IA
    const resultado = await chamarIA(textoVaga, textoCurriculo);

    // Gera HTML do currículo
    const htmlCurriculo = gerarHTMLCurriculo(resultado);

    // Salva HTML temporário para download
    const htmlPath = path.join(__dirname, 'uploads', `curriculo_${Date.now()}.html`);
    fs.writeFileSync(htmlPath, htmlCurriculo);

    res.json({
      scoreMatch: resultado.scoreMatch,
      analise: resultado.analise,
      curriculoPersonalizado: resultado.curriculoPersonalizado,
      htmlCurriculo: htmlCurriculo,
      downloadUrl: `/download/curriculo_${path.basename(htmlPath)}`
    });

  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: erro.message });
  }
});

app.get('/download/:arquivo', (req, res) => {
  const caminho = path.join(__dirname, 'uploads', req.params.arquivo);
  if (fs.existsSync(caminho)) {
    res.download(caminho);
  } else {
    res.status(404).json({ erro: 'Arquivo não encontrado' });
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    provider: IA_PROVIDER,
    simulacao: IA_PROVIDER === 'simulacao',
    status: 'online'
  });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  console.log(`Provedor de IA: ${IA_PROVIDER}`);
});
