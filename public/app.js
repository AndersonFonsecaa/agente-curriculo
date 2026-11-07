/**
 * Agente de Currículo - Versão Avançada com IA
 * Funciona com backend (server-ia.js) + IA (OpenAI/Anthropic/Google)
 */

const $ = (id) => document.getElementById(id);

const form       = $('formAnalise');
const btnAnalisar= $('btnAnalisar');
const btnTeste   = $('btnTeste');
const btnLerLink = $('btnLerLink');
const resultado  = $('resultado');
const msgErro    = $('mensagemErro');
const preview    = $('previewCurriculo');

const inputLinkVaga   = $('linkVaga');
const inputTextoVaga  = $('textoVaga');
const inputArqVaga    = $('arquivoVaga');
const inputArqCurric  = $('arquivoCurriculo');
const hintUrl         = $('urlHint');

let estado = {
  textoCurriculo: '',
  textoVaga:    ''
};

// ============================================================
// UTILITÁRIOS
// ============================================================
function log(m) { console.log('[Agente] ' + m); }

function erro(m) {
  if (!msgErro) return;
  msgErro.textContent = m;
  msgErro.classList.remove('hidden');
  log('ERRO: ' + m);
}

function limparErro() {
  if (!msgErro) return;
  msgErro.classList.add('hidden');
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

// Atualiza estado.textoVaga quando o usuário digita
if (inputTextoVaga) {
  inputTextoVaga.addEventListener('input', () => {
    estado.textoVaga = inputTextoVaga.value.trim();
  });
}

// ============================================================
// LER PÁGINA DA VAGA VIA LINK (r.jina.ai)
// ============================================================
if (btnLerLink) {
  btnLerLink.addEventListener('click', async () => {
    const url = (inputLinkVaga ? inputLinkVaga.value : '').trim();
    if (!url) { erro('Cole o link da vaga primeiro.'); return; }
    if (!url.startsWith('http')) { erro('O link deve começar com http:// ou https://'); return; }

    btnLerLink.disabled = true;
    btnLerLink.textContent = 'Lendo...';
    limparErro();

    try {
      const resp = await fetch('https://r.jina.ai/' + encodeURIComponent(url), {
        headers: { Accept: 'text/plain' }
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const texto = await resp.text();
      if (!texto || texto.trim().length < 50) throw new Error('Página sem conteúdo suficiente.');

      const limpo = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0).join('\n');
      estado.textoVaga = limpo;
      if (inputTextoVaga) inputTextoVaga.value = limpo;
      if (hintUrl) { hintUrl.textContent = '✅ Página lida (' + limpo.length + ' caracteres)'; hintUrl.style.color = '#10b981'; }
      btnLerLink.textContent = 'Página lida ✓';
      log('Vaga lida do link: ' + limpo.length + ' chars');
    } catch (e) {
      erro(e.message || 'Falha ao ler a página da vaga.');
    } finally {
      btnLerLink.disabled = false;
      btnLerLink.textContent = '🔗 Ler página da vaga';
    }
  });
}

// ============================================================
// LER ARQUIVOS (TXT / PDF / DOCX)
// ============================================================
function lerTexto(arquivo) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error('Não foi ler ' + arquivo.name));
    r.readAsText(arquivo, 'UTF-8');
  });
}

function lerBuffer(arquivo) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error('Não foi ler ' + arquivo.name));
    r.readAsArrayBuffer(arquivo);
  });
}

async function lerPDF(buf) {
  if (typeof pdfjsLib === 'undefined') throw new Error('PDF precisa de internet. Use .TXT.');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let t = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const p = await pdf.getPage(i);
    const c = await p.getTextContent();
    t += c.items.map(it => it.str).join(' ') + '\n';
  }
  return t;
}

async function lerDOCX(buf) {
  if (typeof mammoth === 'undefined') throw new Error('DOCX precisa de internet. Use .TXT.');
  const r = await mammoth.extractRawText({ arrayBuffer: buf });
  return r.value;
}

async function processarArquivo(arquivo) {
  const ext = arquivo.name.split('.').pop().toLowerCase();
  const tipo = arquivo.type || '';
  if (ext === 'txt' || tipo === 'text/plain') return await lerTexto(arquivo);
  const buf = await lerBuffer(arquivo);
  if (ext === 'pdf' || tipo === 'application/pdf') return await lerPDF(buf);
  if (ext === 'docx' || tipo.includes('wordprocessingml')) return await lerDOCX(buf);
  throw new Error('Formato não suportado: .' + ext);
}

let bibliotecasCarregadas = false;
let bibliotecasCarregando = false;

function carregarExternas() {
  if (bibliotecasCarregadas) return Promise.resolve();
  if (bibliotecasCarregando) {
    return new Promise((res) => {
      const v = setInterval(() => { if (bibliotecasCarregadas) { clearInterval(v); res(); } }, 200);
      setTimeout(() => { clearInterval(v); res(); }, 30000);
    });
  }
  bibliotecasCarregando = true;
  return new Promise((res) => {
    const s = [];
    if (typeof pdfjsLib === 'undefined') s.push(new Promise((r) => { const x = document.createElement('script'); x.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'; x.onload = () => { if (typeof pdfjsLib !== 'undefined') pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; r(); }; x.onerror = r; document.head.appendChild(x); }));
    if (typeof mammoth === 'undefined') s.push(new Promise((r) => { const x = document.createElement('script'); x.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js'; x.onload = r; x.onerror = r; document.head.appendChild(x); }));
    Promise.all(s).then(() => { bibliotecasCarregadas = true; bibliotecasCarregando = false; res(); }).catch(() => { bibliotecasCarregando = false; res(); });
  });
}

if (inputArqCurric) {
  inputArqCurric.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    btnAnalisar.disabled = true;
    btnAnalisar.textContent = 'Processando currículo...';
    try {
      await carregarExternas();
      estado.textoCurriculo = await processarArquivo(f);
      log('Currículo: ' + estado.textoCurriculo.length + ' chars');
      btnAnalisar.textContent = 'Currículo carregado ✓';
      setTimeout(() => { btnAnalisar.disabled = false; btnAnalisar.textContent = 'Analisar Match e Gerar Currículo'; }, 600);
    } catch (err) {
      erro(err.message);
      btnAnalisar.disabled = false;
      btnAnalisar.textContent = 'Analisar Match e Gerar Currículo';
    }
  });
}

if (inputArqVaga) {
  inputArqVaga.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    btnAnalisar.disabled = true;
    btnAnalisar.textContent = 'Processando vaga...';
    try {
      await carregarExternas();
      estado.textoVaga = await processarArquivo(f);
      if (inputTextoVaga) inputTextoVaga.value = estado.textoVaga.substring(0, 400) + '...';
      log('Vaga arquivo: ' + estado.textoVaga.length + ' chars');
      btnAnalisar.textContent = 'Vaga carregada ✓';
      setTimeout(() => { btnAnalisar.disabled = false; btnAnalisar.textContent = 'Analisar Match e Gerar Currículo'; }, 600);
    } catch (err) {
      erro(err.message);
      btnAnalisar.disabled = false;
      btnAnalisar.textContent = 'Analisar Match e Gerar Currículo';
    }
  });
}

// ============================================================
// BOTÃO TESTE
// ============================================================
const CURR_EX = `Anderson da Silva
analista de seguranca da informacao
email: anderson@email.com
telefone: (11) 99999-9999
localizacao: Sao Paulo, SP
linkedin: linkedin.com/in/andersonsilva

EXPERIENCIA PROFISSIONAL
Empresa Tech Solutions — Analista de Seguranca da Informacao Jr
Set/2022 – Presente
• Responsavel por monitoramento de SOC, analise de vulnerabilidades, gestao de incidentes de seguranca e conformidade com LGPD.
• Reducao de incidentes de seguranca em 30%, implementacao de politica de senhas fortes.

Empresa Web Dev Ltda — Estagiario de TI
Abr/2020 – Set/2022
• Suporte tecnico, instalacao de software, configuracao de redes e firewall.
• Atendimento a mais de 100 chamados mensais.

EDUCACAO
Bacharel em Sistemas de Informacao — Faculdade de Tecnologia de Sao Paulo
2018 – 2022

HABILIDADES
Seguranca da informacao, SIEM, SOC, Firewall, VPN, LGPD, Analise de vulnerabilidades, Git, HTML, CSS, Comunicacao, Trabalho em equipe`;

const VAGA_EX = `VAGA: Analista de Segurança Júnior

Empresa: NTT DATA
Local: São Paulo, SP (híbrido)

Requisitos:
- Experiência com monitoramento de SOC
- Conhecimento em SIEM e ferramentas de segurança
- Análise de vulnerabilidades
- Resposta a incidentes de segurança
- Conhecimento de LGPD
- Firewall e VPN`;

if (btnTeste) {
  btnTeste.addEventListener('click', () => {
    estado.textoCurriculo = CURR_EX;
    estado.textoVaga = VAGA_EX;
    if (inputTextoVaga) inputTextoVaga.value = VAGA_EX;
    if (inputArqCurric) inputArqCurric.value = '';
    if (hintUrl) { hintUrl.textContent = '✅ Usando dados de exemplo'; hintUrl.style.color = '#10b981'; }
    btnAnalisar.textContent = 'Exemplo carregado ✓';
    btnAnalisar.disabled = false;
    form.dispatchEvent(new Event('submit'));
  });
}

// ============================================================
// SUBMIT DO FORMULÁRIO (envia para backend com IA)
// ============================================================
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limparErro();
    if (!resultado) return;
    resultado.classList.add('hidden');
    resultado.style.display = 'none';

    const textoVagaAtual = (inputTextoVaga ? inputTextoVaga.value : '').trim();

    if (!estado.textoCurriculo) { erro('Carregue seu currículo (arquivo .TXT, .PDF ou .DOCX).'); return; }
    if (!textoVagaAtual && !estado.textoVaga) { erro('Cole o texto da vaga ou envie um arquivo da vaga.'); return; }

    btnAnalisar.disabled = true;
    btnAnalisar.textContent = 'Analisando com IA...';

    try {
      const formData = new FormData();
      formData.append('textoVaga', textoVagaAtual || estado.textoVaga || '');
      formData.append('curriculo', inputArqCurric.files[0]);

      const resp = await fetch('/api/analisar', { method: 'POST', body: formData });
      const dados = await resp.json();

      if (!resp.ok) throw new Error(dados.erro || 'Erro na análise');

      // Score principal
      const sEl = $('scoreValor'); if (sEl) sEl.textContent = dados.scoreMatch;

      // Análise básica
      const lf = $('listaPontosFortes'); if (lf) lf.innerHTML = (dados.analise.pontosFortes || []).map(p => `<li>${esc(p)}</li>`).join('');
      const ll = $('listaLacunas'); if (ll) ll.innerHTML = (dados.analise.lacunas || []).map(l => `<li>${esc(l)}</li>`).join('');
      const lr = $('listaRecomendacoes'); if (lr) lr.innerHTML = (dados.analise.recomendacoes || []).map(r => `<li>${esc(r)}</li>`).join('');

      // Match detalhado
      const md = $('matchDetalhado');
      if (md && dados.analise.matchDetalhado) {
        const d = dados.analise.matchDetalhado;
        md.innerHTML = `
          <div class="match-grid">
            <div class="match-item"><div class="match-valor">${d.habilidadesTecnicas || 0}</div><div class="match-label">Habilidades Técnicas</div></div>
            <div class="match-item"><div class="match-valor">${d.experiencia || 0}</div><div class="match-label">Experiência</div></div>
            <div class="match-item"><div class="match-valor">${d.educacao || 0}</div><div class="match-label">Educação</div></div>
            <div class="match-item"><div class="match-valor">${d.softSkills || 0}</div><div class="match-label">Soft Skills</div></div>
            <div class="match-item"><div class="match-valor">${d.ats || 0}</div><div class="match-label">Compatibilidade ATS</div></div>
          </div>
        `;
        md.style.display = 'block';
      }

      // Roadmap de gaps
      const rg = $('roadmapGaps');
      if (rg && dados.analise.roadmapGaps && dados.analise.roadmapGaps.length) {
        rg.innerHTML = '<h3>🗺️ Roadmap para preencher gaps</h3><ul>' +
          dados.analise.roadmapGaps.map(g => `
            <li>
              <strong>${esc(g.gap)}</strong> — ${esc(g.sugestao)}
              ${g.link ? `<br><a href="${esc(g.link)}" target="_blank">🔗 Acessar recurso</a>` : ''}
            </li>
          `).join('') + '</ul>';
        rg.style.display = 'block';
      }

      // Carta de apresentação
      const cp = $('cartaApresentacao');
      if (cp && dados.cartaApresentacao) {
        cp.innerHTML = '<h3>📄 Carta de Apresentação Personalizada</h3><div class="carta-conteudo">' + esc(dados.cartaApresentacao).replace(/\n/g, '<br>') + '</div>';
        cp.style.display = 'block';
      }

      // Entrevista
      const ev = $('entrevistaSecao');
      if (ev && dados.entrevista && dados.entrevista.perguntas && dados.entrevista.perguntas.length) {
        ev.innerHTML = '<h3>🎤 Guia de Entrevista</h3>' +
          dados.entrevista.perguntas.map(p => `
            <div class="pergunta-item">
              <div class="pergunta-titulo">❓ ${esc(p.pergunta)}</div>
              <div class="pergunta-resposta"><strong>Resposta sugerida:</strong> ${esc(p.respostaSugerida)}</div>
              ${p.dica ? `<div class="pergunta-dica">💡 ${esc(p.dica)}</div>` : ''}
            </div>
          `).join('');
        ev.style.display = 'block';
      }

      // Checklist
      const ck = $('checklistSecao');
      if (ck && dados.checklistAplicacao && dados.checklistAplicacao.length) {
        ck.innerHTML = '<h3>✅ Checklist antes de enviar</h3><ul>' +
          dados.checklistAplicacao.map(i => `<li>${esc(i)}</li>`).join('') + '</ul>';
        ck.style.display = 'block';
      }

      // Currículo personalizado
      preview.innerHTML = dados.htmlCurriculo || '';
      resultado.classList.remove('hidden');
      resultado.style.display = 'block';
      resultado.scrollIntoView({ behavior: 'smooth' });
      log('Sucesso IA. Score: ' + dados.scoreMatch + '%');
    } catch (err) {
      erro(err.message || 'Erro inesperado.');
      log('ERRO: ' + err);
    } finally {
      btnAnalisar.disabled = false;
      btnAnalisar.textContent = 'Analisar Match e Gerar Currículo';
    }
  });
}

// ============================================================
// IMPRESSÃO / DOWNLOAD
// ============================================================
window.imprimirCurriculo = function () {
  const c = preview.innerHTML;
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Currículo</title>
<style>@page{margin:1.8cm}body{font-family:'Segoe UI',Tahoma,sans-serif;color:#333;line-height:1.6;font-size:10.5px;margin:0}header{text-align:center;border-bottom:3px solid #2563eb;padding-bottom:18px;margin-bottom:24px}h1{color:#1e40af;margin:0 0 8px 0;font-size:24px}.contato{display:flex;justify-content:center;gap:16px;font-size:10.5px;color:#666;flex-wrap:wrap}h2{color:#2563eb;font-size:13.5px;border-bottom:2px solid #e5e7eb;padding-bottom:5px;margin-top:22px;margin-bottom:12px;text-transform:uppercase;letter-spacing:1px}.resumo{background:#f8fafc;padding:14px;border-radius:8px;border-left:4px solid #2563eb;margin-bottom:18px;text-align:justify}.experiencia{margin-bottom:18px}.exp-header{display:flex;justify-content:space-between;margin-bottom:4px}.cargo{font-weight:bold;color:#1e40af}.periodo{color:#6b7280;font-size:10px}.empresa{font-weight:bold;margin-bottom:5px;color:#374151}.realizacoes{margin:5px 0 0 20px;padding:0}.realizacoes li{margin-bottom:3px}.educacao{margin-bottom:14px}.habilidades{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.skill{background:#e0e7ff;color:#1e40af;padding:4px 10px;border-radius:16px;font-size:9.5px;font-weight:600}</style>
</head><body>${c}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 600);
};

window.baixarHTML = function () {
  const blob = new Blob([preview.innerHTML], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'curriculo_personalizado.html';
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
};

// ============================================================
// INIT
// ============================================================
log('Página carregada.');
if ($('statusBar')) $('statusBar').style.display = 'flex';
if ($('statusProvider')) {
  $('statusProvider').innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10b981;margin-right:6px"></span><strong>IA Avançada</strong> <em>(match granular + carta + entrevista + roadmap)</em>';
}

window.onerror = function (msg, url, linha) {
  erro('Erro (linha ' + linha + '): ' + msg);
  return true;
};
