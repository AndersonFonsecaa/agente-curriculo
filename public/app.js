/**
 * Agente de Currículo - Versão Robusta
 * Funciona 100% no navegador, sem servidor
 * Suporte a: link de vaga, colar texto, arquivo TXT/PDF/DOCX
 */

// ============================================================
// 1. REFERÊNCIAS DOS ELEMENTOS
// ============================================================
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

// ============================================================
// 2. ESTADO
// ============================================================
let estado = {
  textoCurriculo: '',
  textoVaga:    ''
};

// ============================================================
// 3. UTILITÁRIOS
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

// Atualiza estado.textoVaga sempre que o usuário digita/cola no textarea
if (inputTextoVaga) {
  inputTextoVaga.addEventListener('input', () => {
    estado.textoVaga = inputTextoVaga.value.trim();
  });
}

// ============================================================
// 4. LER PÁGINA DA VAGA VIA LINK (r.jina.ai)
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
// 5. LER ARQUIVOS (TXT / PDF / DOCX)
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
  if (!bibliotecasCarregadas || typeof pdfjsLib === 'undefined') {
    throw new Error('Biblioteca pdf.js não carregou. Verifique sua conexão com a internet e tente novamente, ou use um arquivo .TXT.');
  }
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
  if (!bibliotecasCarregadas || typeof mammoth === 'undefined') {
    throw new Error('Biblioteca mammoth.js não carregou. Verifique sua conexão com a internet e tente novamente, ou use um arquivo .TXT.');
  }
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
  // Já carregadas
  if (bibliotecasCarregadas) return Promise.resolve();

  // Já está carregando
  if (bibliotecasCarregando) {
    return new Promise((res) => {
      const verificar = setInterval(() => {
        if (bibliotecasCarregadas) {
          clearInterval(verificar);
          res();
        }
      }, 200);
      setTimeout(() => { clearInterval(verificar); res(); }, 30000);
    });
  }

  bibliotecasCarregando = true;

  return new Promise((res, rej) => {
    const scripts = [];
    const tempoLimite = 30000;

    if (typeof pdfjsLib === 'undefined') {
      scripts.push(new Promise((resolve, reject) => {
        const x = document.createElement('script');
        x.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        x.onload = () => {
          // Configura o worker do pdf.js
          if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          }
          resolve();
        };
        x.onerror = () => reject(new Error('Falha ao baixar pdf.js'));
        x.onabort = () => reject(new Error('Download do pdf.js interrompido'));
        document.head.appendChild(x);
        setTimeout(() => reject(new Error('Timeout baixando pdf.js')), tempoLimite);
      }));
    }

    if (typeof mammoth === 'undefined') {
      scripts.push(new Promise((resolve, reject) => {
        const x = document.createElement('script');
        x.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
        x.onload = resolve;
        x.onerror = () => reject(new Error('Falha ao baixar mammoth.js'));
        x.onabort = () => reject(new Error('Download do mammoth.js interrompido'));
        document.head.appendChild(x);
        setTimeout(() => reject(new Error('Timeout baixando mammoth.js')), tempoLimite);
      }));
    }

    Promise.all(scripts)
      .then(() => {
        bibliotecasCarregadas = true;
        bibliotecasCarregando = false;
        log('Bibliotecas externas carregadas com sucesso');
        res();
      })
      .catch((err) => {
        bibliotecasCarregando = false;
        log('Aviso: Bibliotecas externas não carregadas: ' + err.message);
        // Não rejeita - permite continuar com TXT apenas
        res();
      });
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
// 6. ANÁLISE DE MATCH
// ============================================================
function palavras(t) {
  if (!t) return [];
  return t.toLowerCase().replace(/[^\w\sáàâãéèêíìîóòôõúùûç]/g, ' ').split(/\s+/).filter(p => p.length >= 4);
}

function calcularMatch(vaga, curriculo) {
  const pv = [...new Set(palavras(vaga))];
  const pc = new Set(palavras(curriculo));
  const enc = pv.filter(p => pc.has(p));
  const falt = pv.filter(p => !pc.has(p));
  const score = pv.length ? Math.min(98, Math.max(20, Math.round(enc.length / pv.length * 100))) : 0;
  return { score, enc, falt: falt.slice(0, 10), total: pv.length };
}

function analisar(match, vagaTexto) {
  const fortes = [], lac = [], rec = [];
  if (match.enc.length > 0) {
    fortes.push(`${match.enc.length} de ${match.total} palavras-chave da vaga encontradas no seu currículo`);
    fortes.push('Habilidades principais alinhadas aos requisitos');
  } else { fortes.push('Currículo carregado'); }
  if (match.falt.length > 0) lac.push(`Faltando: ${match.falt.join(', ')}`);
  lac.push('Considere adicionar mais termos técnicos da vaga');
  rec.push('Inclua palavras-chave da vaga nas suas experiências');
  rec.push('Quantifique resultados com números e porcentagens');
  rec.push('Destaque projetos parecidos com a vaga no topo');
  rec.push('Use o mesmo vocabulário da vaga para filtros ATS');
  return { scoreMatch: match.score, analise: { pontosFortes: fortes, lacunas: lac, recomendacoes: rec } };
}

// ============================================================
// 7. GERAR CURRÍCULO
// ============================================================
function extrairNome(t) {
  const l = t.split('\n').map(x => x.trim()).filter(x => x.length > 0);
  return l[0] ? l[0].substring(0, 60) : 'Seu Nome';
}
function emailCurriculo(t) { const m = t.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/); return m ? m[0] : 'seu.email@exemplo.com'; }
function telefoneCurriculo(t) { const m = t.match(/\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}/); return m ? m[0] : '(00) 0000-0000'; }

function habilidadesCurriculo(curriculoTexto, palavrasVaga) {
  const tecnicas = ['javascript','python','java','sql','excel','power bi','aws','azure','docker','kubernetes','git','html','css','react','node.js','typescript','c#','php','ruby','go','linux','windows','scrum','agile','jira','segurança','cibersegurança','seguranca','firewall','vpn','siem','soc','lgpd','gdpr','criptografia','mfa','incidente','resposta a incidentes','analise de vulnerabilidade','analise de riscos','redes','banco de dados','front-end','back-end','full stack','devops','cloud','microsoft office','word','powerpoint','outlook','freshdesk','troubleshooting','itil','sql','windows','hardware','software','notebooks','impressoras','periféricos','dispositivos móveis','redes de computadores','documentação de soluções','atendimento remoto','atendimento presencial','sistemas de tickets','gestão de incidentes','gestão de requisições'];
  const comuns = ['comunicação','trabalho em equipe','liderança','resolução de problemas','gestão de tempo','adaptabilidade','pensamento crítico','organização','criatividade','trabalho sob pressão','atendimento ao cliente','negociação'];
  const tl = curriculoTexto.toLowerCase();
  const ach = [];
  palavrasVaga.forEach(p => { if (tecnicas.includes(p) && tl.includes(p)) { const c = p.charAt(0).toUpperCase() + p.slice(1); if (!ach.includes(c)) ach.push(c); } });
  comuns.forEach(c => { if (tl.includes(c) && !ach.includes(c)) ach.push(c.charAt(0).toUpperCase() + c.slice(1)); });
  const palavrasMaiusculas = curriculoTexto.match(/\b[A-Z][a-zA-Z]+\b/g) || [];
  palavrasMaiusculas.forEach(p => {
    if (p.length > 2 && p.length < 25 && !ach.includes(p) && p !== 'Seu' && p !== 'Empresa' && p !== 'Instituição' && p !== 'Faculdade' && p !== 'Universidade' && p !== 'Tecnologia' && p !== 'Informática' && p !== 'Informação') {
      ach.push(p);
    }
  });
  return ach.slice(0, 15);
}

function extrairSecoes(texto) {
  const linhas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const secoes = [];
  let atual = null;
  const palavrasSecao = ['resumo profissional','competências técnicas','competencias tecnicas','experiencia profissional','experiência profissional','formacao academica','formação acadêmica','cursos e certificacoes','cursos e certificações'];
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    const linhaLower = linha.toLowerCase();
    const ehSecao = palavrasSecao.some(ps => linhaLower === ps || linhaLower.startsWith(ps));
    if (ehSecao && linha.length < 60) {
      if (atual) secoes.push(atual);
      atual = { titulo: linha, conteudo: [] };
    } else if (atual) {
      atual.conteudo.push(linha);
    }
  }
  if (atual) secoes.push(atual);
  return secoes;
}

function limparBalao(linha) {
  return linha.replace(/^[•\-\*]\s*/, '').trim();
}

function limparBalao(linha) {
  return linha.replace(/^[•\-\*]\s*/, '').trim();
}

function experienciasCurriculo(t) {
  const secoes = extrairSecoes(t);
  const secaoExp = secoes.find(s => /experi/i.test(s.titulo));
  let blocos = secaoExp ? secaoExp.conteudo : [];
  if (blocos.length === 0) {
    blocos = t.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  }

  const exp = [];
  let atual = null;
  const data = /\b(19|20)\d{2}\b/;

  for (const linha of blocos) {
    const limpa = limparBalao(linha);

    if (limpa.length < 2) continue;

    // 1. Linha com '—' ou '|' = Empresa + Cargo
    if (limpa.includes('—') || limpa.includes('|')) {
      // Salva experiência anterior se existir
      if (atual) { exp.push(atual); atual = null; }

      const partes = limpa.split(/[—|]/).map(p => p.trim()).filter(p => p.length > 0);
      if (partes.length >= 2) {
        atual = { empresa: partes[0], cargo: partes[1], periodo: '', descricao: '', realizacoes: [] };
      } else {
        atual = { empresa: partes[0] || '', cargo: '', periodo: '', descricao: '', realizacoes: [] };
      }
      continue;
    }

    // 2. Linha com padrão de data (Set/2024, Dez/2020, etc.) = Período
    if (data.test(limpa) && limpa.length < 60) {
      if (atual) {
        if (!atual.periodo) atual.periodo = limpa;
      }
      continue;
    }

    // 3. Linha com bullet point ou longa = realização/descrição
    if (atual && limpa.length > 5) {
      const semBalao = limparBalao(linha);
      if (linha.startsWith('•') || linha.startsWith('-') || linha.startsWith('*')) {
        if (!atual.realizacoes) atual.realizacoes = [];
        atual.realizacoes.push(semBalao);
      } else {
        atual.descricao = atual.descricao ? atual.descricao + ' | ' + semBalao : semBalao;
      }
      continue;
    }

    // 4. Linha curta sem data, sem atual = empresa isolada
    if (!atual && limpa.length < 80) {
      atual = { empresa: limpa, cargo: '', periodo: '', descricao: '', realizacoes: [] };
      continue;
    }
  }

  // Última experiência pendente
  if (atual) exp.push(atual);

  // Fallback se não extraiu nada
  if (exp.length === 0) {
    const linhas = t.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    for (let i = 0; i < linhas.length - 1; i++) {
      const l1 = linhas[i];
      const l2 = linhas[i + 1];
      if (l1.length > 2 && l1.length < 60 && l2.length > 2 && l2.length < 60 && !data.test(l1) && !data.test(l2)) {
        exp.push({ empresa: l1, cargo: l2, periodo: 'Período não informado', descricao: 'Experiência profissional.', realizacoes: [] });
        i++;
        if (exp.length >= 3) break;
      }
    }
  }

  if (exp.length === 0) {
    exp.push({ empresa: 'Empresa Anterior', cargo: 'Seu Último Cargo', periodo: 'Período não informado', descricao: 'Responsável por atividades da área.', realizacoes: ['Entrega de projetos', 'Colaboração em equipe'] });
  }
  return exp.slice(0, 4);
}

function educacaoCurriculo(t) {
  const secoes = extrairSecoes(t);
  const secaoEdu = secoes.find(s => /educ|formacao|form[aã]ao/i.test(s.titulo));
  let blocos = secaoEdu ? secaoEdu.conteudo : [];
  if (blocos.length === 0) {
    blocos = t.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  }

  const edu = [];
  const curso = /(bacharel|licenciatura|tecn[oô]logo|mestrado|doutorado|gradua[cç][aã]o|t[cé]cnico|superior|curso|universidade|faculdade|instituto|escola)/i;
  const data = /\b(19|20)\d{2}\b/;

  for (let i = 0; i < blocos.length; i++) {
    const linha = blocos[i].trim();

    // Linha com '—' = Curso — Instituição
    if (linha.includes('—') && curso.test(linha) && linha.length < 120) {
      const partes = linha.split('—').map(p => p.trim()).filter(p => p.length > 0);
      const cursoNome = partes[0] || '';
      const instituicao = partes[1] || 'Instituição';
      // Próxima linha pode ser a data
      let periodo = 'Período não informado';
      if (blocos[i + 1] && data.test(blocos[i + 1]) && blocos[i + 1].length < 60) {
        periodo = blocos[i + 1];
        i++; // pula a linha de data
      }
      edu.push({ curso: cursoNome, instituicao: instituicao, periodo: periodo });
      if (edu.length >= 3) break;
      continue;
    }

    // Linha simples com palavra de curso
    if (curso.test(linha) && linha.length < 120) {
      const instituicao = blocos[i + 1] ? blocos[i + 1] : 'Instituição';
      let periodo = 'Período não informado';
      // Pula se a próxima linha parece ser instituição (não data)
      if (blocos[i + 1] && !data.test(blocos[i + 1]) && blocos[i + 1].length < 100) {
        // próxima linha é instituição, data está depois
        if (blocos[i + 2] && data.test(blocos[i + 2])) {
          periodo = blocos[i + 2];
          i += 2;
        } else {
          i += 1;
        }
      } else if (blocos[i + 1] && data.test(blocos[i + 1])) {
        periodo = blocos[i + 1];
        i += 1;
      }
      edu.push({ curso: linha, instituicao: instituicao, periodo: periodo });
      if (edu.length >= 3) break;
    }
  }

  if (edu.length === 0) {
    for (let i = 0; i < blocos.length; i++) {
      const linha = blocos[i].trim();
      if ((/universidade|faculdade|instituto/i.test(linha)) && linha.length < 100) {
        edu.push({ curso: 'Curso Superior', instituicao: linha, periodo: 'Período não informado' });
        if (edu.length >= 2) break;
      }
    }
  }

  if (edu.length === 0) {
    edu.push({ curso: 'Seu Curso', instituicao: 'Sua Instituição', periodo: 'Concluído' });
  }
  return edu;
}

function montarHTML(res, cur) {
  const exp = cur.experiencias.map(e => `
    <div class="experiencia">
      <div class="exp-header"><span class="cargo">${esc(e.cargo)}</span><span class="periodo">${esc(e.periodo)}</span></div>
      <div class="empresa">${esc(e.empresa)}</div>
      <p>${esc(e.descricao)}</p>
      ${e.realizacoes && e.realizacoes.length ? `<ul class="realizacoes">${e.realizacoes.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
    </div>`).join('');
  const edu = cur.educacao.map(e => `<div class="educacao"><div><strong>${esc(e.curso)}</strong> - ${esc(e.instituicao)}</div><div class="periodo">${esc(e.periodo)}</div></div>`).join('');
  const skills = cur.habilidades.map(h => `<span class="skill">${esc(h)}</span>`).join('');
  const cor = res.scoreMatch >= 70 ? '#10b981' : res.scoreMatch >= 50 ? '#f59e0b' : '#ef4444';
  return `<div class="curriculo-gerado">
    <header>
      <h1>${esc(cur.nome)}</h1>
      <div class="contato"><span>📧 ${esc(cur.contato.email)}</span><span>📞 ${esc(cur.contato.telefone)}</span><span>📍 ${esc(cur.contato.localizacao)}</span><span>🔗 ${esc(cur.contato.linkedin)}</span></div>
      <div class="score-badge" style="background:${cor};color:white;padding:6px 16px;border-radius:20px;font-weight:bold;font-size:14px;display:inline-block;margin-top:10px;">Match com a vaga: ${res.scoreMatch}%</div>
    </header>
    <section><h2>Resumo Profissional</h2><div class="resumo">${esc(cur.resumoProfissional)}</div></section>
    <section><h2>Experiência Profissional</h2>${exp}</section>
    <section><h2>Educação</h2>${edu}</section>
    <section><h2>Habilidades</h2><div class="habilidades">${skills}</div></section>
  </div>`;
}

function gerarCurriculo(res, vagaTexto, curriculoTexto) {
  const pv = palavras(vagaTexto);
  const hab = habilidadesCurriculo(curriculoTexto, pv);
  const exp = experienciasCurriculo(curriculoTexto);
  const edu = educacaoCurriculo(curriculoTexto);
  const top = hab.slice(0, 5).join(', ');

  // Log de debug para ver o que foi extraído
  log('=== EXTRAÇÃO DO CURRÍCULO ===');
  log('Nome: ' + extrairNome(curriculoTexto));
  log('Email: ' + emailCurriculo(curriculoTexto));
  log('Telefone: ' + telefoneCurriculo(curriculoTexto));
  log('Experiências: ' + JSON.stringify(exp));
  log('Educação: ' + JSON.stringify(edu));
  log('Habilidades: ' + JSON.stringify(hab));
  log('=============================');

  const primeiroCargo = (exp[0] && exp[0].cargo) ? exp[0].cargo : 'profissional';
  const resumoProfissional = `Profissional focado em ${pv.slice(0, 3).join(' e ')} com experiência como ${primeiroCargo} e histórico de entregas alinhados aos requisitos da vaga. Habilidades em ${top}. Comprometido com qualidade, prazos e colaboração.`;

  return {
    nome: extrairNome(curriculoTexto),
    contato: { email: emailCurriculo(curriculoTexto), telefone: telefoneCurriculo(curriculoTexto), localizacao: 'Sua Cidade, UF', linkedin: 'linkedin.com/in/seuperfil' },
    resumoProfissional: resumoProfissional,
    experiencias: exp,
    educacao: edu,
    habilidades: hab
  };
}

// ============================================================
// 8. BOTÃO TESTE
// ============================================================
const CURR_EX = `Anderson da Silva
analista de seguranca da informacao
email: anderson@email.com
telefone: (11) 99999-9999
localizacao: Sao Paulo, SP
linkedin: linkedin.com/in/andersonsilva

EXPERIENCIA PROFISSIONAL
Empresa Tech Solutions
Cargo: Analista de Seguranca da Informacao Jr
Periodo: 2022 - Presente
Descricao: Responsavel por monitoramento de SOC, analise de vulnerabilidades, gestao de incidentes de seguranca e conformidade com LGPD.
Realizacoes: Reducao de incidentes de seguranca em 30%, implementacao de politica de senhas fortes

Empresa Web Dev Ltda
Cargo: Estagiario de TI
Periodo: 2020 - 2022
Descricao: Suporte tecnico, instalacao de software, configuracao de redes e firewall.
Realizacoes: Atendimento a mais de 100 chamados mensais

EDUCACAO
Bacharel em Sistemas de Informacao
Faculdade de Tecnologia de Sao Paulo
Periodo: 2018 - 2022

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
// 9. SUBMIT DO FORMULÁRIO (envia para backend com IA)
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

      const sEl = $('scoreValor'); if (sEl) sEl.textContent = dados.scoreMatch;
      const lf = $('listaPontosFortes'); if (lf) lf.innerHTML = dados.analise.pontosFortes.map(p => `<li>${esc(p)}</li>`).join('');
      const ll = $('listaLacunas'); if (ll) ll.innerHTML = dados.analise.lacunas.map(l => `<li>${esc(l)}</li>`).join('');
      const lr = $('listaRecomendacoes'); if (lr) lr.innerHTML = dados.analise.recomendacoes.map(r => `<li>${esc(r)}</li>`).join('');

      preview.innerHTML = dados.htmlCurriculo;
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
// 10. IMPRESSÃO / DOWNLOAD
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
// 11. ERRO GLOBAL + INIT
// ============================================================
window.onerror = function (msg, url, linha) {
  erro('Erro no JavaScript (linha ' + linha + '): ' + msg);
  return true;
};

log('Página carregada. Elementos: form=' + !!form + ' btn=' + !!btnAnalisar + ' resultado=' + !!resultado + ' link=' + !!inputLinkVaga + ' textarea=' + !!inputTextoVaga + ' arquivo=' + !!inputArqCurric);
if ($('statusBar')) $('statusBar').style.display = 'flex';
if ($('statusProvider')) {
  const libsOk = typeof pdfjsLib !== 'undefined' && typeof mammoth !== 'undefined';
  $('statusProvider').innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10b981;margin-right:6px"></span><strong>Frontend local</strong> <em>(leitura de vaga via link + análise por palavras-chave' + (libsOk ? ' + PDF/DOCX via internet' : '') + ')</em>';
}

// Tenta pré-carregar bibliotecas em background ao abrir a página
carregarExternas().then(() => {
  if ($('statusProvider')) {
    const libsOk = typeof pdfjsLib !== 'undefined' && typeof mammoth !== 'undefined';
    $('statusProvider').innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + (libsOk ? '#10b981' : '#f59e0b') + ';margin-right:6px"></span><strong>Frontend local</strong> <em>(leitura de vaga via link + análise por palavras-chave' + (libsOk ? ' + PDF/DOCX prontos' : ' - PDF/DOCX sem internet') + ')</em>';
  }
});
