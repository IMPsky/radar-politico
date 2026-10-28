/* Pesquisa: procura uma palavra em tudo que o app guarda — notícias, projetos, mudanças nas leis
   e no texto completo das leis — e abre o assunto inteiro (artigo completo, lei inteira ou a notícia lida dentro do app). */
(function () {
  'use strict';

  const A = () => window.App;
  const L = () => window.Leis;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtData = v => { const d = new Date(v); return isNaN(d) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }); };

  // dobra cada letra (sem acento, minúscula) mantendo o mesmo tamanho do texto — assim a posição achada vale no texto original
  const foldCache = new Map();
  function fold(s) {
    s = String(s || '');
    let out = '';
    for (const ch of s) {
      let f = foldCache.get(ch);
      if (f === undefined) {
        f = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        f = f.length === 1 ? f : (f[0] || ' ');
        if (ch.length === 2) f = f + ' '; // caracteres fora do BMP ocupam 2 posições
        foldCache.set(ch, f);
      }
      out += f;
    }
    return out.replace(/[º°]/g, 'o').replace(/ª/g, 'a');
  }

  // "ficha limpa" entre aspas = frase exata; senão, todas as palavras precisam aparecer
  function termos(q) {
    const out = [];
    String(q || '').replace(/"([^"]+)"|(\S+)/g, (m, frase, pal) => {
      const t = fold((frase || pal).trim()).replace(/^[^\w]+|[^\w]+$/g, '');
      if (t.length >= 2 || /^\d$/.test(t)) out.push(t);
      return m;
    });
    return [...new Set(out)];
  }
  function bate(textoF, ts) { return ts.every(t => textoF.includes(t)); }
  function pontos(textoF, ts) { let n = 0; ts.forEach(t => { let i = -1; while ((i = textoF.indexOf(t, i + 1)) !== -1 && n < 200) n++; }); return n; }

  // destaca as palavras pesquisadas
  function hl(texto, ts, f) {
    texto = String(texto || '');
    f = f || fold(texto);
    const r = [];
    ts.forEach(t => { let i = -1; while ((i = f.indexOf(t, i + 1)) !== -1) r.push([i, i + t.length]); });
    if (!r.length) return esc(texto);
    r.sort((a, b) => a[0] - b[0]);
    const m = [r[0]];
    r.slice(1).forEach(x => { const u = m[m.length - 1]; if (x[0] <= u[1]) u[1] = Math.max(u[1], x[1]); else m.push(x); });
    let out = '', p = 0;
    m.forEach(([a, b]) => { out += esc(texto.slice(p, a)) + '<mark>' + esc(texto.slice(a, b)) + '</mark>'; p = b; });
    return out + esc(texto.slice(p));
  }
  const hlBr = (t, ts) => hl(t, ts).replace(/\n/g, '<br>');

  // trecho em volta da primeira palavra encontrada
  function trecho(texto, ts, tam) {
    texto = String(texto || '').replace(/\s*\n\s*/g, ' ');
    tam = tam || 240;
    const f = fold(texto);
    let pos = -1;
    ts.forEach(t => { const i = f.indexOf(t); if (i !== -1 && (pos === -1 || i < pos)) pos = i; });
    if (texto.length <= tam) return hl(texto, ts, f);
    let ini = Math.max(0, pos - Math.floor(tam / 3));
    if (ini > 0) { const sp = texto.indexOf(' ', ini); if (sp !== -1 && sp < pos) ini = sp + 1; }
    let fim = Math.min(texto.length, ini + tam);
    const sp2 = texto.lastIndexOf(' ', fim); if (sp2 > pos) fim = sp2;
    return (ini > 0 ? '… ' : '') + hl(texto.slice(ini, fim), ts, f.slice(ini, fim)) + (fim < texto.length ? ' …' : '');
  }

  // ---------- índice ----------
  const st = { q: '', filtro: 'tudo', leis: null, leisMsg: '', carregando: false, abertos: {} };
  let leisF = null; // [{id, nome, url, arts:[[key, texto, textoF]]}]
  let root = null;

  async function carregarLeis(forcar) {
    if (!L() || !L().garantirLeis) return;
    if (st.leis && !forcar) return;
    st.carregando = true;
    st.leisMsg = 'Preparando o texto das leis para pesquisar…';
    pintarStatus();
    try {
      const lista = await L().garantirLeis(A().store, nome => { st.leisMsg = 'Baixando do Planalto: ' + nome + '…'; pintarStatus(); });
      st.leis = lista;
      leisF = lista.map(l => ({ id: l.id, nome: l.nome, url: l.url, verificado: l.verificado, arts: Object.entries(l.artigos).map(([k, t]) => [k, t, fold(k + ' ' + t)]) }));
      const faltam = L().LEIS.length - lista.length;
      st.leisMsg = faltam ? `${faltam} lei(s) ainda não puderam ser baixadas do Planalto (sem internet ou site fora do ar). Toque em ↻ para tentar de novo.` : '';
    } catch (e) {
      st.leisMsg = 'Não foi possível baixar as leis agora: ' + (e.message || e);
    }
    st.carregando = false;
    if (root) { pintarStatus(); pintarResultados(); }
  }

  function fontesSimples() {
    const store = A().store;
    const out = [];
    // Nova notícia (tudo que o app detectou)
    store.get('feed', []).forEach((f, i) => out.push({ grupo: f.kind === 'lei' ? 'mud' : 'not', tipo: 'feed', i, f, titulo: f.title, texto: f.detail || '', fonte: srcNome(f.sourceId), quando: f.at, url: f.url }));
    // conteúdo atual de cada card (manchetes, projetos)
    const vistos = new Set(out.map(o => o.url + '|' + o.titulo));
    A().allSources().forEach(s => {
      store.get('latest:' + s.id, []).forEach(it => {
        if (!it || !it.title || /^lei-/.test(it.id || '')) return;
        const k = it.url + '|' + it.title;
        if (vistos.has(k)) return; vistos.add(k);
        out.push({ grupo: 'not', tipo: 'item', titulo: it.title, texto: it.meta || '', fonte: s.title, url: it.url });
      });
    });
    // mudanças detectadas nas leis (texto antes × depois)
    (L() && L().events ? L().events() : []).forEach(ev => (ev.mudancas || []).forEach(m => out.push({ grupo: 'mud', tipo: 'mud', ev: ev.id, titulo: `${ev.nome} — ${m.art} (${m.tipo})`, texto: (m.depois || '') + '\n' + (m.antes || ''), fonte: 'Mudança detectada', quando: ev.detectado })));
    // resumos em linguagem simples
    Object.entries((L() && L().RESUMOS) || {}).forEach(([id, r]) => out.push({ grupo: 'ent', tipo: 'resumo', id, titulo: r.nome + ' — explicada de forma simples', texto: [r.serve].concat(r.pontos, [r.candidato]).join('\n'), fonte: 'Interpretação' }));
    // favoritos
    store.get('favorites', []).forEach(f => out.push({ grupo: 'not', tipo: 'item', titulo: f.title, texto: f.url, fonte: '⭐ Favoritos', url: f.url }));
    return out;
  }
  function srcNome(id) { const s = A().byId(id); return s ? s.title : ''; }

  function buscar() {
    const ts = termos(st.q);
    if (!ts.length) return null;
    const res = { lei: [], not: [], mud: [], ent: [], ts };
    fontesSimples().forEach(o => {
      const f = fold(o.titulo + '\n' + o.texto);
      if (!bate(f, ts)) return;
      o.score = pontos(fold(o.titulo), ts) * 5 + pontos(f, ts) + (o.quando ? Math.max(0, 3 - (Date.now() - new Date(o.quando)) / 864e5 / 30) : 0);
      res[o.grupo].push(o);
    });
    // artigo pedido pelo número (ex.: "art 14" ou "artigo 14")
    const mArt = /\bart(?:igo)?\.?\s*(\d+)(?:\s*-?\s*([a-z]))?\b/i.exec(st.q);
    (leisF || []).forEach(l => l.arts.forEach(([k, t, f]) => {
      const kNum = /Art\. (\d+)(?:-([A-Z]))?/.exec(k);
      const pedido = mArt && kNum && kNum[1] === mArt[1] && (!mArt[2] || (kNum[2] || '').toLowerCase() === mArt[2].toLowerCase()) && !/^ADCT/.test(k);
      const resto = mArt ? ts.filter(t => !/^(art|artigo|art\.)$/.test(t) && t !== mArt[1] && t !== (mArt[2] || '').toLowerCase()) : ts;
      if (pedido ? !bate(f, resto) : !bate(f, ts)) return;
      res.lei.push({ grupo: 'lei', tipo: 'art', lei: l.id, nome: l.nome, art: k, texto: t, score: (pedido ? 1000 : 0) + pontos(f, ts) + (pontos(fold(k), ts) * 3) });
    }));
    ['lei', 'not', 'mud', 'ent'].forEach(g => res[g].sort((a, b) => b.score - a.score));
    return res;
  }

  // ---------- telas ----------
  const GRUPOS = [['lei', '📜 Leis (texto oficial em vigor)'], ['mud', '✏️ Mudanças nas leis'], ['not', '📰 Notícias, projetos e páginas'], ['ent', '📖 Entenda as leis']];
  const FILTROS = [['tudo', 'Tudo'], ['lei', 'Leis'], ['mud', 'Mudanças'], ['not', 'Notícias'], ['ent', 'Entenda']];

  function mount(container, header, q) {
    if (q != null) st.q = q;
    container.innerHTML = header + `
      <main class="bx">
        <div class="bx-box"><span>🔍</span><input id="bx-q" type="search" enterkeyhint="search" autocomplete="off" placeholder="Pesquise qualquer palavra: voto, ficha limpa, vereador…" value="${esc(st.q)}"></div>
        <div class="chips bx-f">${FILTROS.map(([k, n]) => `<button class="chip ${st.filtro === k ? 'on' : ''}" data-act="bx-filtro" data-k="${k}">${n}</button>`).join('')}</div>
        <div id="bx-status"></div>
        <div id="bx-res"></div>
      </main>`;
    root = container;
    const inp = container.querySelector('#bx-q');
    let t = null;
    inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { st.q = inp.value; st.abertos = {}; pintarResultados(); }, 220); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { inp.blur(); st.q = inp.value; pintarResultados(); salvarHistorico(st.q); } });
    if (!st.q) setTimeout(() => inp.focus(), 60);
    pintarStatus();
    pintarResultados();
    carregarLeis(false);
  }
  function unmount() { root = null; }

  function pintarStatus() {
    const el = root && root.querySelector('#bx-status');
    if (!el) return;
    el.innerHTML = st.carregando ? `<div class="bx-st"><span class="spin"></span> ${esc(st.leisMsg)}</div>`
      : st.leisMsg ? `<div class="bx-st warn">${esc(st.leisMsg)} <button class="refresh" data-act="bx-leis">↻</button></div>`
        : st.leis ? `<div class="bx-st ok">Pesquisando em ${st.leis.length} leis (${leisF.reduce((n, l) => n + l.arts.length, 0).toLocaleString('pt-BR')} artigos), nas notícias e nas mudanças detectadas.</div>` : '';
  }

  function historico() { return A().store.get('buscaHist', []); }
  function salvarHistorico(q) {
    q = String(q || '').trim(); if (q.length < 2) return;
    A().store.set('buscaHist', [q].concat(historico().filter(x => x.toLowerCase() !== q.toLowerCase())).slice(0, 10));
  }

  function itemHtml(o, ts, idx) {
    if (o.tipo === 'art') {
      return `<button class="bx-it" data-act="bx-art" data-lei="${esc(o.lei)}" data-art="${esc(o.art)}">
        <div class="bx-top"><b>${esc(o.art)}</b><span>${esc(o.nome)}</span></div>
        <p>${trecho(o.texto, ts)}</p><em>Ver o artigo completo ›</em></button>`;
    }
    const quando = o.quando ? ' · ' + fmtData(o.quando) : '';
    return `<button class="bx-it" data-act="bx-abrir" data-g="${o.grupo}" data-i="${idx}">
      <div class="bx-top"><b>${hl(o.titulo, ts)}</b></div>
      ${o.texto ? `<p>${trecho(o.texto, ts, 200)}</p>` : ''}
      <small>${esc(o.fonte || '')}${quando}</small><em>${o.tipo === 'resumo' ? 'Ler a explicação ›' : o.tipo === 'mud' || (o.f && o.f.kind === 'lei' && o.f.ev) ? 'Ver o que mudou ›' : 'Ler o assunto completo ›'}</em></button>`;
  }

  let ultimo = null;
  function pintarResultados() {
    const el = root && root.querySelector('#bx-res');
    if (!el) return;
    const r = buscar();
    ultimo = r;
    if (!r) {
      const h = historico();
      el.innerHTML = `${h.length ? `<h3 class="bx-h">Pesquisas recentes</h3><div class="bx-hist">${h.map(q => `<button class="chip" data-act="bx-hist" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : ''}
        <h3 class="bx-h">Sugestões</h3><div class="bx-hist">${['ficha limpa', 'inelegível', 'propaganda eleitoral', 'vereador', 'filiação partidária', 'art 14', 'fundo partidário', '"compra de votos"'].map(q => `<button class="chip" data-act="bx-hist" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
        <p class="bx-dica">A pesquisa ignora acentos e maiúsculas. Várias palavras: aparecem os resultados que têm todas elas. Use aspas para a frase exata, como <b>"ficha limpa"</b>. Para um artigo, escreva <b>art 14</b>.</p>`;
      return;
    }
    const total = r.lei.length + r.not.length + r.mud.length + r.ent.length;
    const grupos = GRUPOS.filter(([g]) => st.filtro === 'tudo' || st.filtro === g);
    el.innerHTML = `<p class="bx-n">${total ? `<b>${total.toLocaleString('pt-BR')}</b> resultado(s) para <b>${esc(st.q)}</b>` : `Nada encontrado para <b>${esc(st.q)}</b>.`}</p>
      ${!total ? `<p class="bx-dica">Tente outra palavra, menos palavras, ou sem aspas.${!st.leis && !st.carregando ? ' O texto das leis ainda não foi baixado neste celular — toque em ↻ acima.' : ''}</p>` : ''}
      ${grupos.filter(([g]) => r[g].length).map(([g, nome]) => {
        const lim = st.abertos[g] ? 400 : (st.filtro === 'tudo' ? 6 : 40);
        return `<section class="bx-g"><h3 class="bx-h">${nome} <small>${r[g].length}</small></h3>
          ${r[g].slice(0, lim).map((o, i) => itemHtml(o, r.ts, i)).join('')}
          ${r[g].length > lim ? `<button class="btn ghost small" data-act="bx-mais" data-g="${g}">Mostrar mais ${Math.min(r[g].length, 400) - lim}</button>` : ''}</section>`;
      }).join('')}`;
  }

  // ---------- artigo completo e lei inteira ----------
  function acharLei(id) { return (leisF || []).find(l => l.id === id); }

  async function renderArtigo(container, header, v) {
    if (!leisF) { container.innerHTML = header + '<main class="detail"><div class="bx-st"><span class="spin"></span> Carregando a lei…</div></main>'; await carregarLeis(false); }
    const l = acharLei(v.lei);
    const ts = termos(v.q);
    if (!l) { container.innerHTML = header + '<main class="detail"><div class="warn">O texto desta lei não está no celular. Volte e toque em ↻ na pesquisa.</div></main>'; return; }
    const i = l.arts.findIndex(a => a[0] === v.art);
    const [k, t] = l.arts[i] || ['', ''];
    const ant = l.arts[i - 1], prox = l.arts[i + 1];
    const resumo = L().RESUMOS[l.id];
    container.innerHTML = header + `
      <main class="detail bx-art">
        <div class="hero" style="--c:#2c8f6f"><span class="hero-icon">📜</span><div><h2>${esc(k)}</h2><p>${esc(l.nome)}</p></div></div>
        <div class="bx-texto">${hlBr(t, ts)}</div>
        <div class="bx-nav">
          ${ant && ant[0] !== 'Preâmbulo' ? `<button class="btn ghost small" data-act="bx-art" data-lei="${esc(l.id)}" data-art="${esc(ant[0])}" data-sub="1">‹ ${esc(ant[0])}</button>` : '<span></span>'}
          ${prox ? `<button class="btn ghost small" data-act="bx-art" data-lei="${esc(l.id)}" data-art="${esc(prox[0])}" data-sub="1">${esc(prox[0])} ›</button>` : '<span></span>'}
        </div>
        <button class="btn" data-act="bx-interp" data-lei="${esc(l.id)}" data-art="${esc(k)}">📖 Interpretação (explicar em linguagem simples)</button>
        <div id="bx-interp"></div>
        <button class="btn ghost" data-act="bx-lei" data-lei="${esc(l.id)}" data-art="${esc(k)}">Ler a lei inteira (${l.arts.length.toLocaleString('pt-BR')} artigos) com as palavras destacadas</button>
        ${resumo ? `<button class="btn ghost" data-act="lei-resumo" data-id="${esc(l.id)}">O que essa lei diz, em palavras simples</button>` : ''}
        <button class="btn ghost" data-act="open" data-url="${esc(l.url)}" data-title="${esc(l.nome)}">Abrir no site do Planalto ↗</button>
        <p class="lei-aviso">Texto oficial em vigor copiado do Planalto em ${fmtData(l.verificado)}. Trechos riscados (redação antiga) não aparecem.</p>
      </main>`;
  }

  function renderLei(container, header, v) {
    const l = acharLei(v.lei);
    const ts = termos(v.q);
    if (!l) { container.innerHTML = header + '<main class="detail"><div class="warn">O texto desta lei não está no celular.</div></main>'; return; }
    let n = 0;
    const corpo = l.arts.map(([k, t, f]) => {
      const tem = ts.length && ts.some(x => f.includes(x));
      if (tem) n++;
      return `<article class="bx-la${tem ? ' tem' : ''}${k === v.art ? ' atual' : ''}" id="bxa-${esc(k.replace(/[^\w-]/g, '_'))}"><h4>${esc(k)}</h4><div>${tem ? hlBr(t, ts) : esc(t).replace(/\n/g, '<br>')}</div></article>`;
    }).join('');
    container.innerHTML = header + `
      <main class="detail bx-art">
        <div class="hero" style="--c:#2c8f6f"><span class="hero-icon">📜</span><div><h2>${esc(l.nome)}</h2><p>${ts.length ? `${n} artigo(s) com “${esc(v.q)}”` : 'Texto completo'}</p></div></div>
        ${n ? `<div class="bx-pula"><button class="chip" data-act="bx-pula" data-d="-1">‹ anterior</button><span id="bx-pos">${n} trechos</span><button class="chip" data-act="bx-pula" data-d="1">próximo ›</button></div>` : ''}
        <div class="bx-lei">${corpo}</div>
        <button class="btn ghost" data-act="open" data-url="${esc(l.url)}" data-title="${esc(l.nome)}">Abrir no site do Planalto ↗</button>
      </main>`;
    const alvo = container.querySelector('.bx-la.atual') || container.querySelector('.bx-la.tem');
    if (alvo) setTimeout(() => { alvo.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); pulaIdx = [...container.querySelectorAll('.bx-la.tem')].indexOf(alvo); }, 50);
  }
  let pulaIdx = -1;
  function pular(d) {
    const tems = [...document.querySelectorAll('.bx-la.tem')];
    if (!tems.length) return;
    pulaIdx = (pulaIdx + d + tems.length) % tems.length;
    tems[pulaIdx].scrollIntoView({ block: 'start' }); window.scrollBy(0, -110);
    const p = document.getElementById('bx-pos'); if (p) p.textContent = `${pulaIdx + 1} de ${tems.length}`;
  }

  async function interpretarArtigo(box, leiId, art) {
    const l = acharLei(leiId); if (!l) return;
    const t = (l.arts.find(a => a[0] === art) || [])[1] || '';
    const gl = L().glossarioDe(t);
    const glHtml = gl.length ? `<h5>Palavras difíceis deste artigo</h5><ul class="gl">${gl.map(([w, d]) => `<li><b>${esc(w)}</b>: ${esc(d)}</li>`).join('')}</ul>` : '';
    const cfg = L().aiCfg();
    if (!cfg.prov || !cfg.key) {
      box.innerHTML = `<div class="interp"><h4>📖 Interpretação</h4>
        <p>Este é o <b>${esc(art)}</b> da <b>${esc(l.nome)}</b>.</p>${glHtml || '<p>Este artigo não tem termos do nosso glossário.</p>'}
        <p class="ip-how">Para uma explicação completa, escrita em linguagem simples, configure a IA em ⚙ Ajustes → “Interpretação com IA” (o Gemini tem uso gratuito).</p></div>`;
      return;
    }
    box.innerHTML = '<div class="interp"><span class="spin"></span> A IA está lendo o artigo…</div>';
    try {
      const txt = await L().chamarIA(`Você explica leis brasileiras para pessoas comuns, em português do Brasil simples, sem juridiquês.
Explique o ${art} da ${l.nome}, cujo texto oficial em vigor é:
"""
${t.slice(0, 12000)}
"""
Responda com: 1) **Em uma frase**: o que o artigo diz. 2) **Explicando melhor**: cada parte (incisos e parágrafos) em tópicos curtos. 3) **Exemplo prático** do dia a dia. 4) **Palavras difíceis** com o significado. Não invente nada que não esteja no texto.`);
      box.innerHTML = `<div class="interp ai"><h4>📖 Interpretação (IA)</h4>${L().md(txt)}${glHtml}<p class="lei-aviso">Explicação gerada por IA a partir do texto oficial. Pode conter erros; o texto oficial é o que vale.</p></div>`;
    } catch (e) {
      box.innerHTML = `<div class="interp"><div class="warn">A IA não respondeu (${esc(e.message || e)}).</div>${glHtml}</div>`;
    }
  }

  // ---------- notícia lida dentro do app ----------
  async function renderLeitura(container, header, v) {
    const ts = termos(v.q);
    container.innerHTML = header + `<main class="detail bx-art"><div class="bx-st"><span class="spin"></span> Abrindo a notícia…</div></main>`;
    let html;
    try { html = await A().getText(v.url); } catch (e) { html = null; }
    const doc = html && new DOMParser().parseFromString(html, 'text/html');
    let titulo = v.title || '', blocos = [], data = '';
    if (doc) {
      const meta = n => (doc.querySelector(`meta[property="${n}"], meta[name="${n}"]`) || {}).content || '';
      titulo = meta('og:title') || (doc.querySelector('h1') || {}).textContent || titulo;
      data = meta('article:published_time') || meta('date') || '';
      doc.querySelectorAll('script,style,noscript,nav,header,footer,aside,form,iframe,svg,.menu,.navbar,.breadcrumb,.share,.social,.compartilhar,#menu,#footer,#header').forEach(n => n.remove());
      const cands = [doc.querySelector('[itemprop="articleBody"]'), doc.querySelector('article'), doc.querySelector('main'), doc.querySelector('#content, #conteudo, .content, .conteudo, #parent-fieldname-text, .entry-content, .materia, .noticia')].filter(Boolean);
      let melhor = null, mx = 0;
      (cands.length ? cands : [doc.body]).concat([doc.body]).forEach(c => { if (!c) return; const n = [...c.querySelectorAll('p')].reduce((s, p) => s + p.textContent.trim().length, 0); if (n > mx * 1.15 || (!melhor && n)) { mx = n; melhor = c; } });
      const vistos = new Set();
      (melhor ? melhor.querySelectorAll('h2,h3,h4,p,li,blockquote') : []).forEach(n => {
        const t = n.textContent.replace(/\s+/g, ' ').trim();
        if (t.length < 3 || vistos.has(t) || (n.tagName === 'LI' && t.length < 40)) return;
        vistos.add(t);
        blocos.push([n.tagName, t]);
      });
    }
    const tamanho = blocos.reduce((s, b) => s + b[1].length, 0);
    const temTermo = ts.length ? blocos.filter(b => ts.some(t => fold(b[1]).includes(t))).length : 0;
    container.innerHTML = header + `
      <main class="detail bx-art">
        <h2 class="bx-titulo">${hl(String(titulo).trim(), ts)}</h2>
        <p class="bx-meta">${esc(v.fonte || '')}${data ? ' · ' + fmtData(data) : ''}${ts.length && tamanho > 200 ? ` · “${esc(v.q)}” aparece em ${temTermo} parágrafo(s)` : ''}</p>
        ${tamanho > 200 ? `<div class="bx-texto leitura">${blocos.map(([tag, t]) => /^H/.test(tag) ? `<h4>${hl(t, ts)}</h4>` : tag === 'LI' ? `<p>• ${hl(t, ts)}</p>` : `<p>${hl(t, ts)}</p>`).join('')}</div>`
          : `<div class="warn">Não deu para ler o texto desta página dentro do app${html ? ' (o site monta a página de um jeito que não conseguimos extrair)' : ' (sem resposta do site)'}. Abra no site abaixo.</div>`}
        <button class="btn" data-act="open" data-url="${esc(v.url)}" data-title="${esc(titulo)}">Abrir no site original ↗</button>
        <p class="lei-aviso">Texto lido direto de ${esc((v.url.match(/^https?:\/\/([^/]+)/) || [])[1] || 'site')}. Para fotos, vídeos e anexos, abra no site.</p>
      </main>`;
    const m = container.querySelector('.bx-texto mark');
    if (m) setTimeout(() => { m.scrollIntoView({ block: 'center' }); }, 60);
  }

  function onAct(act, el) {
    const app = A();
    if (act === 'bx-filtro') { st.filtro = el.dataset.k; document.querySelectorAll('.bx-f .chip').forEach(c => c.classList.toggle('on', c.dataset.k === st.filtro)); pintarResultados(); return true; }
    if (act === 'bx-hist') { st.q = el.dataset.q; const i = document.getElementById('bx-q'); if (i) i.value = st.q; salvarHistorico(st.q); pintarResultados(); return true; }
    if (act === 'bx-mais') { st.abertos[el.dataset.g] = true; pintarResultados(); return true; }
    if (act === 'bx-leis') { st.leis = null; carregarLeis(true); return true; }
    if (act === 'bx-art') { salvarHistorico(st.q); const v = { name: 'busca-art', lei: el.dataset.lei, art: el.dataset.art, q: st.q }; if (el.dataset.sub) app.replace(v); else app.go(v); return true; }
    if (act === 'bx-lei') { app.go({ name: 'busca-lei', lei: el.dataset.lei, art: el.dataset.art, q: st.q }); return true; }
    if (act === 'bx-pula') { pular(+el.dataset.d); return true; }
    if (act === 'bx-interp') { const b = document.getElementById('bx-interp'); if (b) interpretarArtigo(b, el.dataset.lei, el.dataset.art); return true; }
    if (act === 'bx-abrir') {
      salvarHistorico(st.q);
      const o = ultimo && ultimo[el.dataset.g] && ultimo[el.dataset.g][+el.dataset.i];
      if (!o) return true;
      if (o.tipo === 'resumo') { app.go({ name: 'leiresumo', id: o.id }); return true; }
      if (o.tipo === 'mud') { app.go({ name: 'lei', ev: o.ev }); return true; }
      if (o.tipo === 'feed') {
        const feed = app.store.get('feed', []);
        const f = feed[o.i];
        if (f && !f.read) { f.read = true; app.store.set('feed', feed); }
        if (o.f.kind === 'lei' && o.f.ev) { app.go({ name: 'lei', ev: o.f.ev }); return true; }
      }
      if (o.url) {
        if (/\.(pdf|docx?|xlsx?|zip)(\?|$)/i.test(o.url)) app.openUrl(o.url, o.titulo);
        else app.go({ name: 'leitura', url: o.url, title: o.titulo, fonte: o.fonte, q: st.q });
      }
      return true;
    }
    return false;
  }

  window.Busca = { mount, unmount, onAct, renderArtigo, renderLei, renderLeitura, _fold: fold, _termos: termos, _hl: hl };
})();
