/* Leis: mudanças detalhadas (artigo por artigo), botão Interpretação e resumos em linguagem simples */
(function () {
  'use strict';

  const LEIS_URL = 'https://raw.githubusercontent.com/IMPsky/radar-politico/main/data/leis/mudancas.json';
  const A = () => window.App;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtData = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  const TIPO = { alterado: ['alterado', 'alterados', 'Alterado'], incluido: ['incluído', 'incluídos', 'Novo'], revogado: ['revogado', 'revogados', 'Revogado'], removido: ['removido', 'removidos', 'Removido'] };

  // ---------- glossário (termos jurídicos → linguagem simples) ----------
  const GLOSSARIO = [
    ['caput', 'a parte principal de um artigo (o texto logo depois do número)'],
    ['parágrafo único', 'o único complemento de um artigo'],
    ['inciso', 'item de uma lista dentro do artigo (I, II, III…)'],
    ['alínea', 'subitem de um inciso (a, b, c…)'],
    ['vedad[oa]s?|é vedad[oa]', 'proibido'],
    ['facultad[oa]|facultativ[oa]', 'permitido, mas não obrigatório'],
    ['ressalvad[oa]s?', 'com exceção de'],
    ['inelegíve(?:l|is)|inelegibilidade', 'quem não pode se candidatar / impedimento para se candidatar'],
    ['elegibilidade', 'direito de se candidatar'],
    ['alistamento', 'inscrição como eleitor (tirar o título)'],
    ['domicílio eleitoral', 'cidade onde a pessoa está inscrita para votar'],
    ['desincompatibiliza\\w*', 'deixar um cargo ou função antes da eleição, como a lei exige'],
    ['trânsito em julgado|transitad[oa] em julgado', 'quando não cabe mais nenhum recurso'],
    ['órgão colegiado', 'tribunal ou grupo de juízes que decide em conjunto'],
    ['pleito', 'eleição'],
    ['circunscrição', 'área da eleição (município, estado ou o país)'],
    ['coligaç(?:ão|ões)', 'união de partidos para disputar uma eleição'],
    ['federação partidária|federações partidárias', 'união de partidos que atuam juntos por no mínimo 4 anos'],
    ['propaganda eleitoral antecipada', 'propaganda feita antes da data permitida'],
    ['condutas? vedadas?', 'atos proibidos a quem ocupa cargo público durante a eleição'],
    ['agentes? públicos?', 'quem exerce cargo ou função pública'],
    ['prestação de contas', 'relatório de quanto se arrecadou e gastou'],
    ['diplomação', 'ato da Justiça Eleitoral que confirma oficialmente quem foi eleito'],
    ['impugnaç(?:ão|ões)', 'pedido para barrar ou contestar algo (ex.: uma candidatura)'],
    ['cassação|cassad[oa]', 'perda do registro, do diploma ou do mandato'],
    ['revogad[oa]s?', 'que deixou de valer'],
    ['redação dada', 'o texto foi reescrito pela lei indicada'],
    ['incluíd[oa] pel[oa]|acrescid[oa]', 'trecho novo criado pela lei indicada'],
    ['vigência|vigor', 'período em que a lei vale'],
    ['sufrágio', 'voto'],
    ['captação ilícita de sufrágio', 'compra de votos'],
    ['abuso de poder', 'uso indevido de dinheiro, cargo ou meios de comunicação para influenciar a eleição'],
    ['improbidade administrativa', 'desonestidade ou má conduta na administração pública'],
    ['erário', 'dinheiro público'],
    ['dolo|dolos[oa]', 'com intenção'],
    ['culpos[oa]', 'sem intenção, por descuido'],
    ['mandato', 'período em que o eleito exerce o cargo'],
    ['suplentes?', 'quem assume se o titular sair'],
    ['quociente eleitoral', 'quantidade de votos que um partido precisa para ganhar uma vaga'],
    ['proporcional', 'eleição de deputados e vereadores, em que as vagas são divididas pelos votos dos partidos'],
    ['majoritári[oa]', 'eleição em que vence quem tem mais votos (presidente, governador, senador, prefeito)'],
    ['impulsionamento', 'pagar para uma publicação aparecer para mais pessoas na internet'],
    ['fundo partidário', 'dinheiro público repassado aos partidos todo ano'],
    ['fundo especial de financiamento de campanha', 'dinheiro público destinado às campanhas'],
    ['outrossim', 'além disso'],
    ['mediante', 'por meio de'],
    ['ensejar|enseja', 'causar, dar motivo'],
    ['inequívoc[oa]', 'claro, sem deixar dúvida'],
    ['prerrogativas?', 'direito especial ligado ao cargo'],
    ['compete|competência', 'é responsabilidade de / área de responsabilidade'],
    ['nos termos d[oa]', 'conforme'],
    ['reclusão', 'pena de prisão mais grave (pode começar em regime fechado)'],
    ['detenção', 'pena de prisão mais leve (começa em regime semiaberto ou aberto)'],
    ['multa', 'punição em dinheiro'],
    ['sanç(?:ão|ões)', 'punição — ou, quando se fala de lei, a aprovação dela pelo Presidente'],
    ['ônus', 'obrigação, encargo'],
    ['litígio', 'disputa na Justiça'],
    ['jurisdição', 'poder de julgar em determinada área'],
    ['juntas? eleitora(?:l|is)', 'grupos que organizam a apuração dos votos'],
    ['zonas? eleitora(?:l|is)', 'área de atendimento da Justiça Eleitoral dentro de um estado'],
    ['registro de candidatura', 'pedido oficial para alguém poder concorrer'],
    ['filiação partidária', 'estar inscrito como membro de um partido'],
  ].map(([t, d]) => [new RegExp('\\b(' + t + ')\\b', 'i'), d]);

  function glossarioDe(texto) {
    const out = [];
    GLOSSARIO.forEach(([re, d]) => { const m = String(texto).match(re); if (m && !out.some(x => x[1] === d)) out.push([m[1].toLowerCase(), d]); });
    return out.slice(0, 14);
  }

  // ---------- resumos das leis em linguagem simples ----------
  const RESUMOS = {
    cf88: {
      nome: 'Constituição Federal (1988)', url: 'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm',
      serve: 'É a lei mais importante do Brasil. Todas as outras leis precisam respeitá-la. Ela define os direitos das pessoas, como o país é organizado e como funcionam os Poderes (Executivo, Legislativo e Judiciário).',
      pontos: [
        'Art. 5º: direitos e garantias de todos — igualdade perante a lei, liberdade de expressão, de crença e de reunião, direito de defesa, entre outros.',
        'Art. 6º: direitos sociais — educação, saúde, alimentação, trabalho, moradia, transporte, lazer, segurança, previdência e assistência a quem precisa.',
        'Art. 14: o voto é obrigatório para quem tem de 18 a 70 anos e opcional para analfabetos, maiores de 70 e jovens de 16 e 17 anos.',
        'Art. 14, § 3º: para se candidatar é preciso ser brasileiro, estar em dia com a Justiça Eleitoral, ter domicílio eleitoral na cidade/estado, estar filiado a um partido e ter a idade mínima: 35 anos (presidente e senador), 30 (governador), 21 (deputado e prefeito) e 18 (vereador).',
        'Art. 16: uma lei que muda o processo eleitoral só vale para eleições que aconteçam pelo menos 1 ano depois de ela entrar em vigor.',
        'Arts. 29 e 29-A: regras dos municípios — número de vereadores conforme a população e limites de gastos da Câmara Municipal.',
      ],
      candidato: 'Define quem pode ser candidato (idade, filiação, domicílio) e garante que mudanças nas regras eleitorais não peguem ninguém de surpresa (regra do 1 ano).',
    },
    l9504: {
      nome: 'Lei das Eleições (Lei 9.504/1997)', url: 'https://www.planalto.gov.br/ccivil_03/leis/l9504.htm',
      serve: 'É o “manual” das eleições: diz como se registra uma candidatura, como funciona a propaganda, quanto e como uma campanha pode arrecadar e gastar e como prestar contas.',
      pontos: [
        'Datas: 1º turno no primeiro domingo de outubro e, quando houver, 2º turno no último domingo de outubro.',
        'Registro de candidatos: os partidos pedem o registro à Justiça Eleitoral até 15 de agosto do ano da eleição.',
        'Cota de gênero (art. 10, § 3º): nas listas de vereadores e deputados, cada partido deve ter no mínimo 30% e no máximo 70% de candidaturas de cada sexo.',
        'Propaganda eleitoral: só é permitida a partir de 16 de agosto; antes disso, fazer pedido explícito de voto é propaganda antecipada.',
        'Dinheiro de campanha: regras de doações, limites de gastos, conta bancária específica e prestação de contas obrigatória.',
        'Condutas vedadas (art. 73 e seguintes): atos proibidos a quem tem cargo público em ano de eleição, como usar bens públicos na campanha.',
      ],
      candidato: 'É a lei que mais afeta o dia a dia da campanha: prazos, propaganda, dinheiro e prestação de contas. Descumprir pode dar multa ou até cassação.',
    },
    lc64: {
      nome: 'Lei de Inelegibilidade (LC 64/1990)', url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp64.htm',
      serve: 'Lista quem NÃO pode se candidatar (inelegíveis) e por quanto tempo, além dos prazos para deixar cargos antes da eleição.',
      pontos: [
        'Inelegíveis: por exemplo, quem foi condenado por certos crimes por um tribunal, quem teve o mandato cassado e quem teve contas públicas rejeitadas por irregularidade grave.',
        'Desincompatibilização: algumas pessoas (servidores, secretários, dirigentes de órgãos públicos etc.) precisam se afastar do cargo alguns meses antes da eleição para poderem concorrer.',
        'Ações na Justiça Eleitoral: define a impugnação de candidatura e a investigação por abuso de poder econômico ou político.',
        'Foi bastante alterada pela Lei da Ficha Limpa (LC 135/2010) e por leis posteriores.',
      ],
      candidato: 'Antes de se candidatar, vale conferir se você não se encaixa em nenhuma inelegibilidade e se precisa se afastar de algum cargo, e com qual antecedência.',
    },
    lc135: {
      nome: 'Lei da Ficha Limpa (LC 135/2010)', url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp135.htm',
      serve: 'Nasceu de uma iniciativa popular e endureceu a Lei de Inelegibilidade (LC 64/1990) para impedir candidaturas de pessoas com condenações graves.',
      pontos: [
        'Torna inelegível quem foi condenado por um tribunal (decisão de órgão colegiado), mesmo que ainda caiba recurso, por crimes como corrupção, lavagem de dinheiro e crimes contra a administração pública.',
        'Também alcança quem renunciou ao mandato para escapar de cassação, quem foi expulso de conselho profissional e quem foi demitido do serviço público, entre outros casos.',
        'A inelegibilidade dura em regra 8 anos. A forma de contar esse prazo já foi alterada por leis posteriores; o texto em vigor fica na LC 64/1990.',
      ],
      candidato: 'Uma condenação por tribunal pode tirar alguém da disputa. Por isso a certidão de antecedentes é analisada no registro da candidatura.',
    },
    l9096: {
      nome: 'Lei dos Partidos Políticos (Lei 9.096/1995)', url: 'https://www.planalto.gov.br/ccivil_03/leis/l9096.htm',
      serve: 'Regula como os partidos são criados e funcionam: estatuto, filiação de membros, finanças e prestação de contas.',
      pontos: [
        'Criação de partido: exige apoio de um número mínimo de eleitores espalhados por vários estados e registro no TSE.',
        'Estatuto: cada partido tem regras internas próprias (escolha de dirigentes, diretórios municipais, disciplina).',
        'Filiação partidária: como entrar e sair de um partido; a filiação é condição para ser candidato.',
        'Fidelidade: quem sai do partido pelo qual foi eleito (em eleição proporcional) pode perder o mandato, salvo exceções previstas em lei.',
        'Fundo Partidário: dinheiro público repassado aos partidos, com prestação de contas anual à Justiça Eleitoral.',
      ],
      candidato: 'Mostra como funciona a filiação e a vida no partido, onde as candidaturas são escolhidas em convenção.',
    },
    l4737: {
      nome: 'Código Eleitoral (Lei 4.737/1965)', url: 'https://www.planalto.gov.br/ccivil_03/leis/l4737compilado.htm',
      serve: 'Organiza a Justiça Eleitoral e o processo de votação, e define os crimes eleitorais.',
      pontos: [
        'Organização: TSE, Tribunais Regionais Eleitorais (como o TRE-PE), juízes e juntas eleitorais.',
        'Alistamento: como o cidadão se inscreve como eleitor e mantém o título em dia.',
        'Votação e apuração: regras das seções eleitorais, mesários e contagem dos votos.',
        'Crimes eleitorais: por exemplo, comprar ou vender voto (art. 299) e divulgar fatos falsos na propaganda.',
      ],
      candidato: 'Traz os crimes eleitorais, que podem levar a punições penais além da perda da candidatura.',
    },
  };

  // ---------- dados do monitor ----------
  const evStoreKey = 'leisData';
  function events() { const d = A().store.get(evStoreKey, null); return (d && d.eventos) || []; }
  function resumoTxt(ev) {
    const r = ev.resumo || {};
    const parts = Object.keys(TIPO).filter(t => r[t]).map(t => `${r[t]} ${r[t] > 1 ? TIPO[t][1] : TIPO[t][0]}`);
    const arts = (ev.mudancas || []).slice(0, 4).map(m => m.art).join(', ');
    return `${parts.join(', ') || 'texto alterado'}${arts ? ' — ' + arts : ''}${ev.total > 4 ? '…' : ''}. Toque para ver o que mudou e a Interpretação.`;
  }

  // ---------- conferência feita pelo próprio celular ----------
  // O Planalto bloqueia os servidores do GitHub, então o app baixa as leis direto do celular,
  // separa artigo por artigo e compara com a última versão guardada no aparelho.
  const LEIS = [
    ['cf88', 'Constituição Federal', 'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm'],
    ['l9504', 'Lei das Eleições (Lei 9.504/1997)', 'https://www.planalto.gov.br/ccivil_03/leis/l9504.htm'],
    ['lc64', 'Lei de Inelegibilidade (LC 64/1990)', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp64.htm'],
    ['lc135', 'Lei da Ficha Limpa (LC 135/2010)', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp135.htm'],
    ['l9096', 'Lei dos Partidos Políticos (Lei 9.096/1995)', 'https://www.planalto.gov.br/ccivil_03/leis/l9096.htm'],
    ['l4737', 'Código Eleitoral (Lei 4.737/1965)', 'https://www.planalto.gov.br/ccivil_03/leis/l4737compilado.htm'],
  ];
  const LOCAL_KEY = 'leisLocal';
  const INTERVALO = 6 * 3600e3;
  const BLOCO = new Set(['P', 'DIV', 'BR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TR', 'TABLE', 'BLOCKQUOTE', 'CENTER', 'TD', 'UL', 'OL']);
  const PULA = new Set(['STRIKE', 'S', 'DEL', 'SCRIPT', 'STYLE', 'HEAD', 'TITLE']);
  const ART = /^Art\.?\s*(\d+)\s*(?:[º°ªo]|o\.)?\s*(?:[-–]\s*([A-Z]{1,3}))?(?=[\s.\-–:]|$)/;
  const TITULO = /^(T[ÍI]TULO|CAP[ÍI]TULO|Se[çc][ãa]o|SE[ÇC][ÃA]O|Subse[çc][ãa]o|LIVRO|PARTE)(?![A-Za-zÀ-ú])/;
  const LIXO = /(Presid[êe]ncia da Rep[úu]blica|Casa Civil|Subchefia para Assuntos|Secretaria Especial para Assuntos|Este texto n[ãa]o substitui)/i;
  const MAX_TXT = 20000;

  // banco local (IndexedDB) para guardar o texto completo das leis — o localStorage é pequeno demais
  function idb() {
    return new Promise((ok, err) => {
      const r = indexedDB.open('radar-leis', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('snap');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => err(r.error);
    });
  }
  async function snapGet(id) {
    try { const db = await idb(); return await new Promise(ok => { const q = db.transaction('snap').objectStore('snap').get(id); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); }); } catch (e) { return null; }
  }
  async function snapPut(id, v) {
    try { const db = await idb(); await new Promise(ok => { const t = db.transaction('snap', 'readwrite'); t.objectStore('snap').put(v, id); t.oncomplete = ok; t.onerror = ok; }); } catch (e) { /* sem espaço */ }
  }

  // baixa os bytes e decodifica com o charset certo (o Planalto usa windows-1252)
  async function baixarLei(url) {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9',
    };
    let bytes, ctype = '';
    const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp;
    if (P && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      const r = await P.request({ url, method: 'GET', headers, responseType: 'arraybuffer', connectTimeout: 60000, readTimeout: 120000 });
      if (r.status >= 400) throw new Error('HTTP ' + r.status);
      const h = r.headers || {};
      ctype = h['Content-Type'] || h['content-type'] || '';
      if (typeof r.data === 'string') { const b = atob(r.data); bytes = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i); }
      else bytes = new Uint8Array(r.data);
    } else {
      const r = await fetch(url, { headers });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      ctype = r.headers.get('content-type') || '';
      bytes = new Uint8Array(await r.arrayBuffer());
    }
    let cs = (ctype.match(/charset=([\w-]+)/i) || [])[1];
    if (!cs) { const head = new TextDecoder('latin1').decode(bytes.slice(0, 4000)); cs = (head.match(/charset=["']?([\w-]+)/i) || [])[1] || 'windows-1252'; }
    if (/^(iso-8859-1|latin-?1)$/i.test(cs)) cs = 'windows-1252';
    try { return new TextDecoder(cs).decode(bytes); } catch (e) { return new TextDecoder('windows-1252').decode(bytes); }
  }

  function linhasDe(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const lines = []; let cur = [];
    const flush = () => { const t = cur.join('').split(/\s+/).filter(Boolean).join(' '); if (t) lines.push(t); cur = []; };
    (function walk(node) {
      for (let n = node.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) { cur.push(n.nodeValue); continue; }
        if (n.nodeType !== 1) continue;
        const tag = n.tagName;
        if (tag === 'BR') { flush(); continue; }
        const st = (n.getAttribute('style') || '').toLowerCase().replace(/\s/g, '');
        if (PULA.has(tag) || st.includes('line-through')) { if (BLOCO.has(tag)) flush(); continue; }
        if (BLOCO.has(tag)) flush();
        walk(n);
        if (BLOCO.has(tag)) flush();
      }
    })(doc.body || doc.documentElement);
    flush();
    return lines;
  }

  function artigosDe(html) {
    const arts = { 'Preâmbulo': [] }, ordem = ['Preâmbulo'];
    let atual = 'Preâmbulo', prefixo = '';
    for (const ln of linhasDe(html)) {
      if (atual === 'Preâmbulo' && LIXO.test(ln)) continue;
      if (/ATO DAS DISPOSI[ÇC][ÕO]ES CONSTITUCIONAIS TRANSIT[ÓO]RIAS/i.test(ln) && ln.length < 80) { prefixo = 'ADCT '; continue; }
      const m = ln.match(ART);
      if (m) {
        let k = `${prefixo}Art. ${m[1]}` + (m[2] ? '-' + m[2].toUpperCase() : '');
        const base = k; let n = 2;
        while (arts[k]) k = `${base} (${n++})`;
        atual = k; arts[k] = []; ordem.push(k);
      } else if (TITULO.test(ln) || (ln === ln.toUpperCase() && ln !== ln.toLowerCase() && ln.length < 120 && !/^[IVXLC]+\s*[-–]/.test(ln))) continue;
      arts[atual].push(ln);
    }
    const out = {};
    ordem.forEach(k => { if (arts[k].length) out[k] = arts[k].join('\n'); });
    return out;
  }

  const normT = t => t.replace(/[º°]/g, 'o').replace(/ª/g, 'a').replace(/[“”"]/g, '"').replace(/’/g, "'").replace(/[–—]/g, '-').split(/\s+/).filter(Boolean).join(' ');
  const notasDe = t => t.match(/\((?:Reda[çc][ãa]o dada|Inclu[íi]d[oa]|Revogad[oa]|Acrescid[oa]|Vide|Renumerad[oa]|Regulamento)[^()]*(?:\([^()]*\)[^()]*)*\)/g) || [];

  function compararArts(antigo, novo) {
    const mud = [];
    for (const [k, txt] of Object.entries(novo)) {
      if (k === 'Preâmbulo') continue;
      if (!(k in antigo)) mud.push({ art: k, tipo: 'incluido', antes: '', depois: txt.slice(0, MAX_TXT), notas: notasDe(txt) });
      else if (normT(antigo[k]) !== normT(txt)) {
        const tipo = /revogad/i.test(txt) && !/revogad/i.test(antigo[k]) && txt.length < antigo[k].length ? 'revogado' : 'alterado';
        const velhas = notasDe(antigo[k]);
        const nn = notasDe(txt).filter(n => !velhas.includes(n));
        mud.push({ art: k, tipo, antes: antigo[k].slice(0, MAX_TXT), depois: txt.slice(0, MAX_TXT), notas: nn.length ? nn : notasDe(txt) });
      }
    }
    for (const [k, txt] of Object.entries(antigo)) if (k !== 'Preâmbulo' && !(k in novo)) mud.push({ art: k, tipo: 'removido', antes: txt.slice(0, MAX_TXT), depois: '', notas: [] });
    return mud;
  }

  async function conferirNoCelular(store, force, so, aviso) {
    const loc = store.get(LOCAL_KEY, { leis: {}, eventos: [] });
    const agora = new Date().toISOString();
    for (const [id, nome, url] of LEIS) {
      if (so && !so.includes(id)) continue;
      if (aviso) aviso(nome);
      const st = loc.leis[id];
      if (!force && st && st.status === 'ok' && Date.now() - Date.parse(st.verificado) < INTERVALO) continue;
      try {
        const html = await baixarLei(url);
        if (/requisi[çc][ãa]o foi bloqueada|bloqueio\.de\.aplicacoes/i.test(html)) throw new Error('o site do Planalto bloqueou a leitura');
        const arts = artigosDe(html);
        const n = Object.keys(arts).length - ('Preâmbulo' in arts ? 1 : 0);
        if (n < 3) throw new Error('página sem artigos reconhecíveis');
        const snap = await snapGet(id);
        const nAnt = snap ? Object.keys(snap.artigos).length - 1 : 0;
        if (snap && nAnt > 1 && n < 0.5 * nAnt) throw new Error('leitura incompleta, mantida a versão anterior');
        if (snap && nAnt > 1) {
          const mud = compararArts(snap.artigos, arts);
          if (mud.length) {
            const resumo = {}; ['alterado', 'incluido', 'revogado', 'removido'].forEach(t => { resumo[t] = mud.filter(x => x.tipo === t).length; });
            loc.eventos.unshift({ id: `${id}-cel-${Date.now()}`, lei: id, nome, url, detectado: agora, resumo, mudancas: mud.slice(0, 60), total: mud.length, origem: 'celular' });
          }
        }
        await snapPut(id, { artigos: arts, verificado: agora });
        loc.leis[id] = { id, nome, url, artigos: n, verificado: agora, status: 'ok' };
      } catch (e) {
        loc.leis[id] = Object.assign({}, loc.leis[id] || { id, nome, url }, { status: 'falha ao ler no celular: ' + String(e.message || e).slice(0, 80), tentativa: agora });
      }
    }
    loc.eventos = loc.eventos.slice(0, 25);
    store.set(LOCAL_KEY, loc);
    return loc;
  }

  async function runMonitor(mon, key, prev, store, getText) {
    let data = { leis: [], eventos: [] };
    try { data = JSON.parse(await getText(mon.url + '?t=' + Date.now())); } catch (e) { /* segue só com o celular */ }
    const loc = await conferirNoCelular(store, false);
    // junta o que o servidor e o celular encontraram (o celular vale quando o servidor foi bloqueado)
    const porId = {};
    (data.leis || []).forEach(l => { porId[l.id] = l; });
    Object.values(loc.leis).forEach(l => { const r = porId[l.id]; if (!r || r.status !== 'ok' || (l.status === 'ok' && Date.parse(l.verificado) > Date.parse(r.verificado || 0))) porId[l.id] = l; });
    const ordem = LEIS.map(x => x[0]);
    data.leis = Object.values(porId).sort((a, b) => ordem.indexOf(a.id) - ordem.indexOf(b.id));
    const vistos = new Set();
    data.eventos = (data.eventos || []).concat(loc.eventos)
      .sort((a, b) => Date.parse(b.detectado) - Date.parse(a.detectado))
      .filter(e => { const k = e.lei + '|' + e.mudancas.map(m => m.art).join(','); if (vistos.has(k)) return false; vistos.add(k); return true; });
    data.verificado = new Date().toISOString();
    const cut = s => (s && s.length > 12000 ? s.slice(0, 12000) + ' […]' : s);
    store.set(evStoreKey, {
      verificado: data.verificado, leis: data.leis || [],
      eventos: (data.eventos || []).slice(0, 25).map(e => Object.assign({}, e, { mudancas: (e.mudancas || []).map(m => Object.assign({}, m, { antes: cut(m.antes), depois: cut(m.depois) })) })),
    });
    const known = new Set((prev && prev.ids) || []);
    const firstRun = !prev || !prev.leis;
    const news = [];
    (data.eventos || []).forEach(ev => {
      if (known.has(ev.id)) return;
      const recente = Date.parse(ev.detectado) > Date.now() - 7 * 864e5;
      if (firstRun && !recente) return;
      news.push({ id: ev.id, ev: ev.id, kind: 'lei', title: `Lei alterada: ${ev.nome}`, detail: resumoTxt(ev), url: ev.url });
    });
    store.set(key, { leis: true, ids: (data.eventos || []).map(e => e.id), checkedAt: Date.now(), ok: true });
    const items = (data.leis || []).map(l => ({
      id: 'lei-' + l.id, title: l.nome, url: l.url,
      meta: l.status === 'ok' ? `Texto conferido em ${fmtData(l.verificado)} · ${l.artigos} artigos` : (l.status || 'aguardando verificação'),
    }));
    if (!items.length) items.push({ id: 'lei-wait', title: 'O monitor de leis ainda vai fazer a primeira leitura', url: 'https://www.planalto.gov.br/ccivil_03/', meta: 'As leis são conferidas a cada 6 horas.' });
    return { news, items };
  }

  // ---------- diferença palavra a palavra ----------
  const toks = s => String(s || '').split(/(\s+)/).filter(x => x !== '');
  function diffWords(a, b) {
    const X = toks(a), Y = toks(b);
    let p = 0; while (p < X.length && p < Y.length && X[p] === Y[p]) p++;
    let s = 0; while (s < X.length - p && s < Y.length - p && X[X.length - 1 - s] === Y[Y.length - 1 - s]) s++;
    const x = X.slice(p, X.length - s), y = Y.slice(p, Y.length - s);
    const out = [];
    if (p) out.push(['=', X.slice(0, p).join('')]);
    if (x.length * y.length > 2.5e6) {
      if (x.length) out.push(['-', x.join('')]);
      if (y.length) out.push(['+', y.join('')]);
    } else if (x.length || y.length) {
      const n = x.length, m = y.length, W = m + 1;
      const L = new Int32Array((n + 1) * W);
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i * W + j] = x[i] === y[j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
      let i = 0, j = 0;
      while (i < n || j < m) {
        if (i < n && j < m && x[i] === y[j]) { out.push(['=', x[i]]); i++; j++; }
        else if (j < m && (i >= n || L[i * W + j + 1] >= L[(i + 1) * W + j])) { out.push(['+', y[j]]); j++; }
        else { out.push(['-', x[i]]); i++; }
      }
    }
    if (s) out.push(['=', X.slice(X.length - s).join('')]);
    const merged = [];
    out.forEach(([o, t]) => { const l = merged[merged.length - 1]; if (l && l[0] === o) l[1] += t; else merged.push([o, t]); });
    // espaços sozinhos entre duas mudanças viram parte delas (leitura mais limpa)
    return merged;
  }
  const br = s => esc(s).replace(/\n/g, '<br>');
  function encurta(t, pos) {
    const w = t.split(/(\s+)/);
    if (w.length <= 120) return br(t);
    if (pos === 'first') return '… ' + br(w.slice(-50).join(''));
    if (pos === 'last') return br(w.slice(0, 50).join('')) + ' …';
    return br(w.slice(0, 40).join('')) + ' <span class="lei-gap">[… trecho sem mudança …]</span> ' + br(w.slice(-40).join(''));
  }
  function diffHtml(m) {
    if (m.tipo === 'incluido') return `<ins>${br(m.depois)}</ins>`;
    if (m.tipo === 'removido') return `<del>${br(m.antes)}</del>`;
    const segs = diffWords(m.antes, m.depois);
    const igual = segs.filter(s => s[0] === '=').reduce((a, s) => a + s[1].trim().split(/\s+/).filter(Boolean).length, 0);
    const maior = Math.max(toks(m.antes).length, toks(m.depois).length) / 2 || 1;
    const picado = segs.filter(s => s[0] !== '=').length > 6 && igual / maior < 0.45;
    if (m.tipo === 'revogado' || picado) return `<div class="lei-blk"><small>Como era</small><del>${br(m.antes)}</del></div><div class="lei-blk"><small>Como ficou</small><ins>${br(m.depois)}</ins></div>`;
    return segs.map(([o, t], i) => o === '=' ? encurta(t, i === 0 ? 'first' : i === segs.length - 1 ? 'last' : 'mid') : o === '+' ? `<ins>${br(t)}</ins>` : `<del>${br(t)}</del>`).join('');
  }
  function trechos(m, op) {
    if (m.tipo === 'incluido') return op === '+' ? [m.depois] : [];
    if (m.tipo === 'removido') return op === '-' ? [m.antes] : [];
    return diffWords(m.antes, m.depois).filter(([o, t]) => o === op && t.trim()).map(([, t]) => t.trim());
  }

  // ---------- interpretação ----------
  const semNotas = t => String(t || '').replace(/\((?:Reda[çc][ãa]o dada|Inclu[íi]d[oa]|Revogad[oa]|Acrescid[oa]|Vide|Renumerad[oa]|Regulamento)[^()]*(?:\([^()]*\)[^()]*)*\)/g, '').replace(/\s+\n/g, '\n').trim();
  const corta = (t, n) => (t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t);
  function simples(t) {
    return String(t).replace(/§\s*(\d+)\s*[º°o]?/g, 'parágrafo $1').replace(/Parágrafo único/g, 'Parágrafo único (complemento do artigo)').replace(/\bArt\.\s*/g, 'Artigo ');
  }
  function rotulo(art) {
    return art.startsWith('ADCT ') ? art.replace('ADCT Art.', 'Artigo') + ' das Disposições Transitórias' : art.replace('Art.', 'Artigo');
  }
  function quemMudou(notas) {
    const leis = [];
    (notas || []).forEach(n => { const m = n.match(/(Lei(?: Complementar)?|Emenda Constitucional|Medida Provisória|Decreto)[^,)]*(?:,\s*de\s*\d{4})?/i); if (m && !leis.includes(m[0])) leis.push(m[0]); });
    return leis;
  }
  function interpretarOffline(ev, only) {
    const lista = (only != null ? [ev.mudancas[only]] : ev.mudancas).slice(0, 15);
    const todos = lista.map(m => m.antes + ' ' + m.depois).join(' ');
    const itens = lista.map(m => {
      const quem = quemMudou(m.notas);
      let txt = '';
      if (m.tipo === 'incluido') txt = `Foi <b>criado um trecho novo</b> na lei. Em resumo, ele diz:<blockquote>${br(corta(simples(semNotas(m.depois)), 700))}</blockquote>`;
      else if (m.tipo === 'revogado') txt = `Este trecho <b>deixou de valer</b> (foi revogado). A regra abaixo <b>não existe mais</b>:<blockquote>${br(corta(simples(semNotas(m.antes)), 600))}</blockquote>`;
      else if (m.tipo === 'removido') txt = `Este trecho <b>saiu do texto</b> da lei:<blockquote>${br(corta(simples(semNotas(m.antes)), 600))}</blockquote>`;
      else {
        const saiu = trechos(m, '-').map(semNotas).filter(Boolean), entrou = trechos(m, '+').map(semNotas).filter(Boolean);
        txt = 'O texto foi <b>reescrito</b>.';
        if (saiu.length) txt += `<div class="ip-out">❌ <b>Saiu:</b> “${esc(corta(simples(saiu.join(' … ')), 450))}”</div>`;
        if (entrou.length) txt += `<div class="ip-in">✅ <b>Entrou:</b> “${esc(corta(simples(entrou.join(' … ')), 450))}”</div>`;
        if (!saiu.length && !entrou.length) txt += ' A mudança foi só de forma (pontuação ou anotações), sem alterar o sentido.';
        txt += `<div class="ip-now">📌 <b>Como ficou agora:</b> ${br(corta(simples(semNotas(m.depois)), 500))}</div>`;
      }
      return `<div class="ip"><h5>${esc(rotulo(m.art))}</h5>${txt}${quem.length ? `<div class="ip-who">Mudança feita por: <b>${esc(quem.join('; '))}</b></div>` : ''}</div>`;
    }).join('');
    const gl = glossarioDe(todos);
    return `<div class="interp">
      <h4>📖 Interpretação — em palavras simples</h4>
      ${itens}
      ${gl.length ? `<h5>Palavras difíceis que aparecem aqui</h5><ul class="gl">${gl.map(([t, d]) => `<li><b>${esc(t)}</b>: ${esc(d)}</li>`).join('')}</ul>` : ''}
      <p class="ip-how"><b>Como ler uma lei:</b> “Art.” é artigo (a regra principal); “§” é parágrafo (complemento ou exceção); “I, II, III” são incisos (itens de uma lista); “a, b, c” são alíneas (subitens).</p>
      <p class="lei-aviso">Explicação automática feita pelo app a partir do texto oficial${aiCfg().key ? '' : ' (sem IA)'}. Não substitui a orientação de um advogado.</p>
    </div>`;
  }

  function aiCfg() { return A().store.get('aiCfg', { prov: '', key: '' }); }
  function promptDe(ev, only) {
    const lista = (only != null ? [ev.mudancas[only]] : ev.mudancas).slice(0, 12);
    let corpo = lista.map(m => `### ${m.art} (${TIPO[m.tipo] ? TIPO[m.tipo][2] : m.tipo})\nComo era:\n${corta(m.antes || '(não existia)', 3500)}\n\nComo ficou:\n${corta(m.depois || '(retirado)', 3500)}`).join('\n\n');
    corpo = corpo.slice(0, 24000);
    return `Você é um professor que explica leis brasileiras para cidadãos comuns, sem formação em Direito.
A lei "${ev.nome}" foi alterada no texto oficial do Planalto. Abaixo estão os trechos que mudaram (como era e como ficou).

Explique em português do Brasil, com linguagem bem simples e frases curtas, SEM inventar nada além do que está no texto. Organize assim:
**O que mudou** (diga claramente o que saiu e o que entrou em cada artigo)
**O que isso significa na prática** (exemplos do dia a dia, especialmente para eleitores, candidatos e partidos)
**Quem é afetado**
**Palavras difíceis explicadas**
Termine lembrando, em uma frase, que a explicação não substitui a orientação de um advogado.

${corpo}`;
  }
  async function chamarIA(prompt) {
    const { prov, key } = aiCfg();
    if (prov === 'gemini') {
      let model = A().store.get('aiGeminiModel', '');
      if (!model) {
        try {
          const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=' + encodeURIComponent(key));
          const j = await r.json();
          const ok = (j.models || []).filter(x => /gemini-[\d.]+-flash$/.test(x.name) && (x.supportedGenerationMethods || []).includes('generateContent')).map(x => x.name).sort().reverse();
          model = ok[0] || 'models/gemini-2.5-flash';
        } catch (e) { model = 'models/gemini-2.5-flash'; }
        A().store.set('aiGeminiModel', model);
      }
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
      });
      const j = await r.json();
      if (!r.ok) { if (r.status === 404) A().store.set('aiGeminiModel', ''); throw new Error((j.error && j.error.message) || 'HTTP ' + r.status); }
      return ((((j.candidates || [])[0] || {}).content || {}).parts || []).map(p => p.text || '').join('');
    }
    if (prov === 'claude') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-haiku-5-5', max_tokens: 1800, messages: [{ role: 'user', content: prompt }] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error((j.error && j.error.message) || 'HTTP ' + r.status);
      return (j.content || []).map(c => c.text || '').join('');
    }
    throw new Error('IA não configurada');
  }
  function md(t) {
    return esc(t).replace(/^#{1,6}\s*(.+)$/gm, '<b>$1</b>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/^\s*[-*•]\s+(.+)$/gm, '<li>$1</li>').replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`).replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
  }
  async function interpretar(box, ev, only) {
    const cfg = aiCfg();
    const ck = 'interp:' + ev.id + (only != null ? ':' + only : '');
    if (box.dataset.open === '1') { box.innerHTML = ''; box.dataset.open = ''; return; }
    box.dataset.open = '1';
    if (!cfg.prov || !cfg.key) {
      box.innerHTML = interpretarOffline(ev, only) + `<button class="btn ghost small" data-act="settings">🤖 Quer uma explicação mais completa? Ative a IA nos Ajustes</button>`;
      return;
    }
    const cached = A().store.get(ck, null);
    if (cached) { box.innerHTML = `<div class="interp ai"><h4>📖 Interpretação (IA)</h4>${md(cached)}</div>`; return; }
    box.innerHTML = '<div class="interp"><p class="muted">⏳ Gerando a interpretação com IA…</p></div>';
    try {
      const txt = await chamarIA(promptDe(ev, only));
      if (!txt.trim()) throw new Error('resposta vazia');
      A().store.set(ck, txt);
      box.innerHTML = `<div class="interp ai"><h4>📖 Interpretação (IA)</h4>${md(txt)}<p class="lei-aviso">Gerado por IA a partir do texto oficial. Pode conter imprecisões; confira na lei.</p></div>`;
    } catch (e) {
      box.innerHTML = `<div class="warn">A IA não respondeu (${esc(e.message)}). Mostrando a interpretação do próprio app:</div>` + interpretarOffline(ev, only);
    }
  }

  // ---------- telas ----------
  function renderChange(container, header, evId) {
    const ev = events().find(e => e.id === evId);
    if (!ev) {
      container.innerHTML = header + `<main class="detail"><div class="warn">Os detalhes desta mudança não estão mais disponíveis neste aparelho. Toque em ↻ Atualizar na Nova notícia ou abra a lei no Planalto.</div></main>`;
      return;
    }
    const r = ev.resumo || {};
    container.innerHTML = header + `
      <main class="detail lei">
        <div class="hero" style="--c:#2c8f6f"><span class="hero-icon">📜</span><div><h2>${esc(ev.nome)}</h2><p>Mudança detectada em ${fmtData(ev.detectado)}</p></div></div>
        <div class="lei-chips">${Object.keys(TIPO).filter(t => r[t]).map(t => `<span class="tp tp-${t}">${r[t]} ${r[t] > 1 ? TIPO[t][1] : TIPO[t][0]}</span>`).join('')}</div>
        <p class="desc">Comparamos o texto oficial do Planalto antes e depois da mudança. <ins>Verde</ins> é texto novo; <del>vermelho riscado</del> é texto que saiu.</p>
        <button class="btn" data-act="lei-interp" data-ev="${esc(ev.id)}">📖 Interpretação (explicar em linguagem simples)</button>
        <div class="lei-interp" id="lei-interp-all"></div>
        ${(ev.mudancas || []).map((m, i) => `
          <section class="lei-ch">
            <header><b>${esc(m.art)}</b><span class="tp tp-${m.tipo}">${TIPO[m.tipo] ? TIPO[m.tipo][2] : esc(m.tipo)}</span></header>
            ${(m.notas || []).length ? `<p class="lei-nota">📝 ${m.notas.map(esc).join('<br>📝 ')}</p>` : ''}
            <div class="lei-diff">${diffHtml(m)}</div>
            ${m.tipo === 'alterado' || m.tipo === 'revogado' ? `<details><summary>Ver o texto completo: como era × como ficou</summary>
              <h5>Como era</h5><div class="lei-full">${br(m.antes)}</div><h5>Como ficou</h5><div class="lei-full">${br(m.depois)}</div></details>` : ''}
            <button class="btn ghost small" data-act="lei-interp" data-ev="${esc(ev.id)}" data-i="${i}">📖 Interpretação deste artigo</button>
            <div class="lei-interp" id="lei-interp-${i}"></div>
          </section>`).join('')}
        ${ev.total > (ev.mudancas || []).length ? `<p class="muted">E mais ${ev.total - ev.mudancas.length} artigo(s) mudaram — veja a lei completa.</p>` : ''}
        <button class="btn ghost" data-act="open" data-url="${esc(ev.url)}" data-title="${esc(ev.nome)}">Abrir a lei completa no Planalto ↗</button>
        <p class="lei-aviso">Fonte: texto oficial em planalto.gov.br, conferido automaticamente a cada 6 horas.</p>
      </main>`;
  }

  function renderSummary(container, header, id) {
    const r = RESUMOS[id];
    if (!r) { container.innerHTML = header + '<main class="detail"><div class="warn">Resumo não encontrado.</div></main>'; return; }
    const gl = glossarioDe(r.serve + ' ' + r.pontos.join(' ') + ' ' + r.candidato);
    const ultimas = events().filter(e => e.lei === id || (id === 'lc135' && e.lei === 'lc64')).slice(0, 3);
    container.innerHTML = header + `
      <main class="detail lei">
        <div class="hero" style="--c:#2c8f6f"><span class="hero-icon">📖</span><div><h2>${esc(r.nome)}</h2><p>Interpretação em linguagem simples</p></div></div>
        <h3>Para que serve</h3><p class="desc">${esc(r.serve)}</p>
        <h3>Pontos principais</h3><ul class="lei-pts">${r.pontos.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
        <h3>Por que importa para quem quer se candidatar</h3><p class="desc">${esc(r.candidato)}</p>
        ${gl.length ? `<h3>Palavras para conhecer</h3><ul class="gl">${gl.map(([t, d]) => `<li><b>${esc(t)}</b>: ${esc(d)}</li>`).join('')}</ul>` : ''}
        ${ultimas.length ? `<h3>Mudanças recentes detectadas</h3><div class="links">${ultimas.map(e => `<button class="link-row" data-act="lei-ver" data-ev="${esc(e.id)}"><span>${esc(e.nome)}</span><small>${fmtData(e.detectado)} · ${esc(resumoTxt(e).replace(/\. Toque.*$/, ''))}</small><b>›</b></button>`).join('')}</div>` : ''}
        <button class="btn ghost" data-act="open" data-url="${esc(r.url)}" data-title="${esc(r.nome)}">Ler a lei completa no Planalto ↗</button>
        <p class="lei-aviso">Resumo informativo, com os pontos gerais da lei. Leis mudam; o texto oficial e atualizado está no Planalto. Não substitui a orientação de um advogado.</p>
      </main>`;
  }

  function lawsSection() {
    return `<h3>Entenda as leis — Interpretação</h3>
      <div class="links">${Object.entries(RESUMOS).map(([id, r]) => `<button class="link-row" data-act="lei-resumo" data-id="${id}"><span>📖 ${esc(r.nome)}</span><small>O que essa lei diz, em palavras simples</small><b>›</b></button>`).join('')}</div>`;
  }

  function settingsHtml() {
    const c = aiCfg();
    return `<h3>Interpretação com IA (opcional)</h3>
      <p class="desc">O botão <b>Interpretação</b> já funciona sem IA, usando um glossário do próprio app. Com uma chave de IA, a explicação fica mais completa e natural. A chave fica guardada só neste celular.</p>
      <select id="ai-prov" class="input">
        <option value="" ${!c.prov ? 'selected' : ''}>Não usar IA</option>
        <option value="gemini" ${c.prov === 'gemini' ? 'selected' : ''}>Google Gemini (tem uso gratuito)</option>
        <option value="claude" ${c.prov === 'claude' ? 'selected' : ''}>Claude (Anthropic, pago)</option>
      </select>
      <input id="ai-key" class="input" type="password" autocomplete="off" placeholder="Cole aqui a chave da API" value="${esc(c.key)}">
      <button class="btn" data-act="lei-ai-save">Salvar configuração da IA</button>
      <div class="links" style="margin-top:10px">
        <button class="link-row" data-act="open" data-url="https://aistudio.google.com/apikey" data-title="Chave do Gemini"><span>Pegar chave gratuita do Gemini</span><small>aistudio.google.com — entre com sua conta Google e toque em “Create API key”</small><b>↗</b></button>
        <button class="link-row" data-act="open" data-url="https://console.anthropic.com/settings/keys" data-title="Chave do Claude"><span>Pegar chave do Claude</span><small>console.anthropic.com</small><b>↗</b></button>
      </div>`;
  }

  function onAct(act, el) {
    const app = A();
    if (act === 'lei-ver') { app.go({ name: 'lei', ev: el.dataset.ev }); return true; }
    if (act === 'lei-resumo') { app.go({ name: 'leiresumo', id: el.dataset.id }); return true; }
    if (act === 'lei-interp') {
      const ev = events().find(e => e.id === el.dataset.ev);
      if (!ev) return true;
      const i = el.dataset.i != null && el.dataset.i !== '' ? +el.dataset.i : null;
      const box = document.getElementById(i == null ? 'lei-interp-all' : 'lei-interp-' + i);
      if (box) interpretar(box, ev, i);
      return true;
    }
    if (act === 'lei-ai-save') {
      const prov = (document.getElementById('ai-prov') || {}).value || '';
      const key = ((document.getElementById('ai-key') || {}).value || '').trim();
      app.store.set('aiCfg', { prov, key });
      app.store.set('aiGeminiModel', '');
      app.toast(prov && key ? 'IA configurada para a Interpretação' : 'Interpretação vai usar o glossário do app (sem IA)');
      return true;
    }
    return false;
  }

  // usado pela Pesquisa: garante que o texto das leis está guardado no celular
  let garantindo = null;
  async function garantirLeis(store, aviso) {
    if (garantindo) return garantindo;
    garantindo = (async () => {
      const falta = [];
      for (const [id] of LEIS) if (!(await snapGet(id))) falta.push(id);
      if (falta.length) await conferirNoCelular(store, true, falta, aviso);
      const out = [];
      for (const [id, nome, url] of LEIS) { const sn = await snapGet(id); if (sn) out.push({ id, nome, url, artigos: sn.artigos, verificado: sn.verificado }); }
      return out;
    })();
    try { return await garantindo; } finally { garantindo = null; }
  }

  window.Leis = { LEIS, garantirLeis, snapGet, glossarioDe, RESUMOS, events, aiCfg, chamarIA, md, LEIS_URL, runMonitor, renderChange, renderSummary, lawsSection, settingsHtml, onAct, diffWords, interpretarOffline };
})();
