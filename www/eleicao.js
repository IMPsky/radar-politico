/* Votação em tempo real — lê os arquivos oficiais de apuração do TSE */
(function () {
  'use strict';

  const BASE = 'https://resultados.tse.jus.br/oficial';
  const UFS = ['ac', 'al', 'am', 'ap', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mg', 'ms', 'mt', 'pa', 'pb', 'pe', 'pi', 'pr', 'rj', 'rn', 'ro', 'rr', 'rs', 'sc', 'se', 'sp', 'to'];
  const UF_NOME = { ac: 'Acre', al: 'Alagoas', am: 'Amazonas', ap: 'Amapá', ba: 'Bahia', ce: 'Ceará', df: 'Distrito Federal', es: 'Espírito Santo', go: 'Goiás', ma: 'Maranhão', mg: 'Minas Gerais', ms: 'Mato Grosso do Sul', mt: 'Mato Grosso', pa: 'Pará', pb: 'Paraíba', pe: 'Pernambuco', pi: 'Piauí', pr: 'Paraná', rj: 'Rio de Janeiro', rn: 'Rio Grande do Norte', ro: 'Rondônia', rr: 'Roraima', rs: 'Rio Grande do Sul', sc: 'Santa Catarina', se: 'Sergipe', sp: 'São Paulo', to: 'Tocantins' };
  const REFRESH_MS = 60000;

  // cores por partido (siglas sem acento, em maiúsculas)
  const PARTY_COLORS = {
    PT: '#e5383b', PCDOB: '#b71c1c', PSB: '#ff7a3d', PDT: '#d9480f', PSOL: '#c2185b', REDE: '#26a69a', PV: '#2e9e4f',
    PL: '#3d5afe', PP: '#1e88e5', REPUBLICANOS: '#00838f', UNIAO: '#1565c0', NOVO: '#fb8c00', PSDB: '#0277bd',
    PSD: '#f2b632', MDB: '#43a047', PODE: '#7e57c2', SOLIDARIEDADE: '#ef6c00', AVANTE: '#9ccc65', CIDADANIA: '#ec407a',
    PRD: '#8d6e63', MISSAO: '#546e7a', PMB: '#ad1457', AGIR: '#5c6bc0', DC: '#6d4c41', PSTU: '#c62828', PCO: '#8e0000', UP: '#d32f2f',
  };
  const FALLBACK = ['#8e24aa', '#00897b', '#6d4c41', '#5e35b1', '#c0ca33', '#00acc1', '#f4511e', '#3949ab'];

  const st = { tab: 'pres', info: null, pres: null, presUF: {}, gov: {}, sel: null, govSel: 'pe', err: null, loading: false, at: 0 };
  let mounted = null;
  let timer = null;

  // ---------- utilidades ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = s => parseFloat(String(s == null ? '0' : s).replace(',', '.')) || 0;
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase();
  const pct = v => v.toFixed(1).replace('.', ',') + '%';
  function votos(v) {
    if (v >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + ' mi';
    if (v >= 1e3) return Math.round(v / 1e3) + ' mil';
    return String(v);
  }
  function titleCase(s) {
    return String(s || '').toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase())
      .replace(/\b(Da|De|Do|Das|Dos|E)\b/g, w => w.toLowerCase());
  }
  function partyColor(sg) {
    const k = norm(sg);
    if (PARTY_COLORS[k]) return PARTY_COLORS[k];
    let h = 0; for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return FALLBACK[h % FALLBACK.length];
  }
  function pair(cands) {
    const a = cands[0], b = cands[1];
    let ca = a ? partyColor(a.partido) : '#777', cb = b ? partyColor(b.partido) : '#777';
    if (ca === cb) cb = '#9e9e9e';
    return { a, b, ca, cb };
  }

  // ---------- dados do TSE ----------
  function decodeJws(txt) {
    const p = txt.trim().split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(p + '='.repeat((4 - p.length % 4) % 4));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
  }
  async function getJws(url) {
    const res = await fetch(url + '?nocache=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return decodeJws(await res.text());
  }
  const dt = s => { const [d, m, y] = String(s || '').split('/').map(Number); return new Date(y, m - 1, d).getTime() || 0; };

  // descobre sozinho a eleição mais recente (funciona também nas próximas eleições)
  async function discover() {
    const cfg = await getJws(`${BASE}/comum/config/ele-c.jws`);
    const found = {};
    (cfg.pl || []).forEach(pl => (pl.e || []).forEach(e => {
      if (e.t !== '1') return;
      (e.abr || []).forEach(ab => (ab.cp || []).forEach(cp => {
        const key = cp.cd === '1' ? 'pres' : cp.cd === '3' ? 'gov' : null;
        if (!key) return;
        const when = dt(pl.dt);
        if (!found[key] || when > found[key].when) found[key] = { when, ciclo: pl.c, t1: e.cd, t2: e.cdt2 || '', ano: String(pl.dt || '').slice(-4) };
      }));
    }));
    return found;
  }

  const fileUrl = (info, ele, uf, cargo) =>
    `${BASE}/${info.ciclo}/${ele}/dados/${uf}/${uf}-c${cargo.padStart(4, '0')}-e${ele.padStart(6, '0')}-u.jws`;

  async function loadResult(info, uf, cargo) {
    if (info.t2) {
      try {
        const d = await getJws(fileUrl(info, info.t2, uf, cargo));
        if (d && d.carg && d.carg.length) return parse(d, info.t2, info, uf);
      } catch (e) { /* sem 2º turno neste local */ }
    }
    return parse(await getJws(fileUrl(info, info.t1, uf, cargo)), info.t1, info, uf);
  }

  function parse(d, ele, info, uf) {
    const c = (d.carg || [])[0] || {};
    const cands = [];
    (c.agr || []).forEach(a => (a.par || []).forEach(p => (p.cand || []).forEach(x => cands.push({
      n: x.n, nome: x.nmu || x.nm, partido: p.sg, votos: +x.vap || 0, pct: num(x.pvapn || x.pvap),
      eleito: x.e === 's', situacao: x.st || '',
      foto: `${BASE}/${info.ciclo}/${ele}/fotos/${uf}/${x.sqcand}.jpeg`,
    }))));
    cands.sort((x, y) => y.votos - x.votos);
    return {
      cands, final: d.tf === 's', turno: ele === info.t2 ? 2 : 1,
      secoes: num(d.s && (d.s.pstn || d.s.pst)),
      hora: `${d.dt || d.dg || ''} ${d.ht || d.hg || ''}`.trim(),
    };
  }

  async function refresh() {
    if (st.loading) return;
    st.loading = true; paint();
    try {
      if (!st.info) st.info = await discover();
      const info = st.info;
      if (st.tab === 'pres') {
        if (!info.pres) throw new Error('Nenhuma eleição presidencial encontrada no TSE');
        st.pres = await loadResult(info.pres, 'br', '1');
        const all = await Promise.allSettled(UFS.map(uf => loadResult(info.pres, uf, '1').then(r => [uf, r])));
        all.forEach(r => { if (r.status === 'fulfilled') st.presUF[r.value[0]] = r.value[1]; });
      } else {
        if (!info.gov) throw new Error('Nenhuma eleição para governador encontrada no TSE');
        const all = await Promise.allSettled(UFS.map(uf => loadResult(info.gov, uf, '3').then(r => [uf, r])));
        all.forEach(r => { if (r.status === 'fulfilled') st.gov[r.value[0]] = r.value[1]; });
        if (!Object.keys(st.gov).length) throw new Error('Sem dados de governador');
      }
      st.err = null; st.at = Date.now();
    } catch (e) {
      st.err = e.message || 'erro de conexão';
    }
    st.loading = false; paint();
  }

  // ---------- desenho ----------
  function duel(r, opts) {
    if (!r || !r.cands.length) return '';
    const { a, b, ca, cb } = pair(r.cands);
    if (!b) return `<div class="duel-solo">${esc(titleCase(a.nome))} — ${pct(a.pct)}</div>`;
    const tot = (a.pct + b.pct) || 1;
    const wa = Math.max(8, Math.min(92, a.pct / tot * 100));
    const cand = (c, side, color) => `
      <div class="dc ${side}">
        <div class="dc-photo" style="--pc:${color}"><img src="${esc(c.foto)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"></div>
        <div class="dc-txt">
          <strong>${esc(titleCase(c.nome))}${c.eleito ? ' <span class="ok">✔</span>' : ''}</strong>
          <small><span class="pt" style="background:${color}">${esc(c.partido)}</span> ${esc(c.n)}</small>
        </div>
      </div>`;
    return `
      <div class="duel ${opts && opts.small ? 'small' : ''}">
        <div class="duel-cands">${cand(a, 'l', ca)}${cand(b, 'r', cb)}</div>
        <div class="duel-bar">
          <div class="seg" style="width:${wa}%;background:${ca}"><b>${pct(a.pct)}</b>${wa >= 34 ? `<span>${votos(a.votos)}</span>` : ''}</div>
          <div class="seg r" style="width:${100 - wa}%;background:${cb}">${100 - wa >= 34 ? `<span>${votos(b.votos)}</span>` : ''}<b>${pct(b.pct)}</b></div>
          <i class="mid"></i>
        </div>
        ${r.cands.length > 2 && !(opts && opts.small) ? `<div class="others">${r.cands.slice(2, 8).filter(c => c.votos > 0).map(c =>
          `<div class="oth"><i style="background:${partyColor(c.partido)}"></i><span>${esc(titleCase(c.nome))} <small>${esc(c.partido)}</small></span><b>${pct(c.pct)}</b></div>`).join('')}</div>` : ''}
      </div>`;
  }

  function mapSvg(results, sel) {
    const M = window.BR_MAP;
    if (!M) return '<div class="ele-msg">Mapa indisponível.</div>';
    const side = ['rn', 'pb', 'pe', 'al', 'se'];
    const paths = M.locations.map(l => {
      const r = results[l.id];
      let fill = '#2a3a33', op = 1;
      if (r && r.cands[0] && r.cands[0].votos > 0) {
        const a = r.cands[0], b = r.cands[1];
        fill = partyColor(a.partido);
        const margin = a.pct - (b ? b.pct : 0);
        op = 0.5 + Math.min(margin, 30) / 30 * 0.5;
      }
      return `<path d="${l.path}" data-ele-uf="${l.id}" fill="${fill}" fill-opacity="${op.toFixed(2)}" class="${sel === l.id ? 'sel' : ''}"></path>`;
    }).join('');
    return `<svg class="br-map" viewBox="0 0 700 639" data-side="${side.join(',')}">${paths}<g class="lbl"></g></svg>`;
  }

  // coloca as siglas dos estados (as do litoral nordestino ficam numa coluna à direita, como no modelo)
  function placeLabels(svg, results) {
    const g = svg.querySelector('g.lbl');
    if (!g) return;
    const side = svg.dataset.side.split(',');
    const NS = 'http://www.w3.org/2000/svg';
    const out = [];
    svg.querySelectorAll('path[data-ele-uf]').forEach(p => {
      const uf = p.dataset.eleUf;
      const b = p.getBBox();
      let x = b.x + b.width / 2, y = b.y + b.height / 2;
      const adj = { go: [-14, 18], df: [6, -2], mg: [6, 8], pi: [-4, 8], ba: [-14, 10], sc: [6, 2], rj: [10, 6], es: [8, 4], ma: [-8, 10], pa: [0, 10], am: [0, 6], ms: [4, 4], to: [0, 6], ap: [0, 6], rr: [0, 4], ac: [0, 4], ro: [0, 4] }[uf];
      if (adj) { x += adj[0]; y += adj[1]; }
      if (side.includes(uf)) { out.push({ uf, x: b.x + b.width * 0.6, y }); return; }
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', x); t.setAttribute('y', y);
      t.textContent = uf.toUpperCase();
      if (uf === 'df') t.setAttribute('class', 'tiny');
      g.appendChild(t);
    });
    out.sort((a, b) => a.y - b.y);
    out.forEach((o, i) => {
      const ly = 230 + i * 30, lx = 640;
      const r = results[o.uf];
      const fill = r && r.cands[0] ? partyColor(r.cands[0].partido) : '#2a3a33';
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', o.x); line.setAttribute('y1', o.y); line.setAttribute('x2', lx - 20); line.setAttribute('y2', ly);
      g.appendChild(line);
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', lx - 20); rect.setAttribute('y', ly - 12); rect.setAttribute('width', 44); rect.setAttribute('height', 24); rect.setAttribute('rx', 5);
      rect.setAttribute('fill', fill); rect.setAttribute('data-ele-uf', o.uf);
      g.appendChild(rect);
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', lx + 2); t.setAttribute('y', ly + 1); t.textContent = o.uf.toUpperCase();
      g.appendChild(t);
    });
  }

  function legend(results) {
    const count = {};
    Object.values(results).forEach(r => { const a = r.cands[0]; if (a && a.votos > 0) count[a.partido] = (count[a.partido] || 0) + 1; });
    const items = Object.entries(count).sort((a, b) => b[1] - a[1]);
    if (!items.length) return '';
    return `<div class="ele-legend">${items.map(([p, n]) => `<span><i style="background:${partyColor(p)}"></i>${esc(p)} <b>${n}</b></span>`).join('')} <em>estados</em></div>`;
  }

  function paint() {
    if (!mounted) return;
    const { container, header } = mounted;
    const isPres = st.tab === 'pres';
    const results = isPres ? st.presUF : st.gov;
    const main = isPres ? st.pres : st.gov[st.govSel];
    const ano = st.info && (isPres ? st.info.pres : st.info.gov) ? (isPres ? st.info.pres : st.info.gov).ano : '';

    let title = 'Apuração oficial do TSE';
    if (isPres && main) {
      const w = main.cands.find(c => c.eleito);
      title = w ? `${titleCase(w.nome)} é eleito presidente` : (main.final ? 'Presidente: disputa vai ao 2º turno' : `Apuração: ${pct(main.secoes)} das seções`);
    } else if (!isPres) {
      title = `Governador · ${UF_NOME[st.govSel] || ''}`;
      if (main) {
        const w = main.cands.find(c => c.eleito);
        title += w ? ` — ${titleCase(w.nome)} venceu` : (main.final && main.turno === 1 ? ' — 2º turno' : '');
      }
    }

    const selR = isPres && st.sel ? st.presUF[st.sel] : null;
    const scroll = window.scrollY;

    container.innerHTML = header + `
      <main class="ele">
        <div class="ele-head">
          <h2>${esc(title)}</h2>
          ${main ? `<span class="chip">${main.turno}º turno${ano ? ' · ' + ano : ''}</span>` : ''}
        </div>
        ${main ? duel(main) : `<div class="ele-msg">${st.err ? 'Não foi possível conectar ao TSE (' + esc(st.err) + ').' : 'Carregando apuração oficial do TSE…'}</div>`}

        <div class="ele-tabs">
          <button class="${isPres ? 'on' : ''}" data-ele-tab="pres">Presidente</button>
          <button class="${!isPres ? 'on' : ''}" data-ele-tab="gov">Governadores</button>
        </div>

        <div class="ele-map">${mapSvg(results, isPres ? st.sel : st.govSel)}</div>
        ${legend(results)}
        <p class="ele-hint">${isPres ? 'Toque em um estado para ver o resultado dele.' : 'Toque em um estado para ver a disputa para governador.'}</p>

        ${selR ? `<div class="ele-uf"><h3>${esc(UF_NOME[st.sel])}</h3>${duel(selR, { small: true })}</div>` : ''}

        <div class="ele-foot">
          ${main ? `Seções apuradas: <b>${pct(main.secoes)}</b> · Atualizado pelo TSE em ${esc(main.hora)}<br>` : ''}
          ${st.err && main ? `<span class="err">Última tentativa falhou: ${esc(st.err)}</span><br>` : ''}
          <span class="refresh" data-ele-refresh>${st.loading ? 'Atualizando…' : '↻ Atualizar agora'}</span>
          <small>Atualiza sozinho a cada minuto. Fonte: TSE (resultados.tse.jus.br). Mapa: @svg-maps/brazil, CC BY 4.0.</small>
        </div>
      </main>`;
    window.scrollTo(0, scroll);
    const svg = container.querySelector('svg.br-map');
    if (svg) placeLabels(svg, results);
  }

  function onClick(e) {
    if (!mounted) return;
    const t = e.target.closest('[data-ele-tab],[data-ele-uf],[data-ele-refresh]');
    if (!t) return;
    if (t.dataset.eleTab) {
      if (st.tab === t.dataset.eleTab) return;
      st.tab = t.dataset.eleTab; paint(); refresh(); return;
    }
    if (t.dataset.eleUf) {
      const uf = t.dataset.eleUf;
      if (st.tab === 'pres') st.sel = st.sel === uf ? null : uf; else st.govSel = uf;
      paint();
      if (st.tab === 'gov') window.scrollTo({ top: 0, behavior: 'smooth' });
      else if (st.sel) { const box = mounted.container.querySelector('.ele-uf'); if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      return;
    }
    if (t.hasAttribute('data-ele-refresh')) refresh();
  }

  window.Eleicao = {
    mount(container, header) {
      mounted = { container, header };
      if (!container.__eleBound) { container.addEventListener('click', onClick); container.__eleBound = true; }
      paint();
      refresh();
      clearInterval(timer);
      timer = setInterval(() => {
        const r = st.tab === 'pres' ? st.pres : st.gov[st.govSel];
        if (!(r && r.final)) refresh();
      }, REFRESH_MS);
    },
    unmount() { mounted = null; clearInterval(timer); timer = null; },
  };
})();
