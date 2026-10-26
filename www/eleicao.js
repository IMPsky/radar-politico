/* Votação em tempo real + eleições passadas
   - Ao vivo: arquivos oficiais de apuração do TSE (resultados.tse.jus.br)
   - Passadas (2014–2024): resumos gerados dos Dados Abertos do TSE (pasta data/historico do projeto) */
(function () {
  'use strict';

  const BASE = 'https://resultados.tse.jus.br/oficial';
  const HIST = 'https://raw.githubusercontent.com/IMPsky/radar-politico/main/data/historico/';
  const UFS = ['ac', 'al', 'am', 'ap', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mg', 'ms', 'mt', 'pa', 'pb', 'pe', 'pi', 'pr', 'rj', 'rn', 'ro', 'rr', 'rs', 'sc', 'se', 'sp', 'to'];
  const UF_NOME = { ac: 'Acre', al: 'Alagoas', am: 'Amazonas', ap: 'Amapá', ba: 'Bahia', ce: 'Ceará', df: 'Distrito Federal', es: 'Espírito Santo', go: 'Goiás', ma: 'Maranhão', mg: 'Minas Gerais', ms: 'Mato Grosso do Sul', mt: 'Mato Grosso', pa: 'Pará', pb: 'Paraíba', pe: 'Pernambuco', pi: 'Piauí', pr: 'Paraná', rj: 'Rio de Janeiro', rn: 'Rio Grande do Norte', ro: 'Rondônia', rr: 'Roraima', rs: 'Rio Grande do Sul', sc: 'Santa Catarina', se: 'Sergipe', sp: 'São Paulo', to: 'Tocantins' };
  const REG = {
    N: { nm: 'Norte', ufs: ['ac', 'am', 'ap', 'pa', 'ro', 'rr', 'to'] },
    NE: { nm: 'Nordeste', ufs: ['al', 'ba', 'ce', 'ma', 'pb', 'pe', 'pi', 'rn', 'se'] },
    CO: { nm: 'Centro-Oeste', ufs: ['df', 'go', 'ms', 'mt'] },
    SE: { nm: 'Sudeste', ufs: ['es', 'mg', 'rj', 'sp'] },
    S: { nm: 'Sul', ufs: ['pr', 'rs', 'sc'] },
  };
  const LEFT = ['N', 'CO', 'S'], RIGHT = ['NE', 'SE'];
  const CARGO = { '1': ['Presidente', 'Presidente'], '3': ['Governador', 'Governadores'], '5': ['Senador', 'Senadores'], '6': ['Deputado Federal', 'Dep. Federais'], '7': ['Deputado Estadual', 'Dep. Estaduais'], '11': ['Prefeito', 'Prefeitos'], '13': ['Vereador', 'Vereadores'] };
  const PROP = new Set(['6', '7', '13']);
  const SMALL = new Set(['rn', 'pb', 'pe', 'al', 'se', 'df', 'es', 'rj', 'sc']);
  const REFRESH_MS = 60000;

  const PARTY_COLORS = {
    PT: '#e5383b', PCDOB: '#b71c1c', PSB: '#ff7a3d', PDT: '#d9480f', PSOL: '#c2185b', REDE: '#26a69a', PV: '#2e9e4f',
    PL: '#3d5afe', PP: '#1e88e5', REPUBLICANOS: '#00838f', PRB: '#00838f', UNIAO: '#1565c0', DEM: '#1565c0', PSL: '#283593', NOVO: '#fb8c00', PSDB: '#0277bd',
    PSD: '#f2b632', MDB: '#43a047', PMDB: '#43a047', PODE: '#7e57c2', PODEMOS: '#7e57c2', SOLIDARIEDADE: '#ef6c00', AVANTE: '#9ccc65', CIDADANIA: '#ec407a', PPS: '#ec407a',
    PRD: '#8d6e63', PTB: '#8d6e63', PROS: '#ff8a65', MISSAO: '#546e7a', PMB: '#ad1457', AGIR: '#5c6bc0', PTC: '#5c6bc0', DC: '#6d4c41', PSC: '#6d4c41', PSTU: '#c62828', PCO: '#8e0000', UP: '#d32f2f', PCB: '#9a0007', PMN: '#ab47bc', PATRIOTA: '#00695c', PATRI: '#00695c', PEN: '#00695c', PR: '#1a237e',
  };
  const FALLBACK = ['#8e24aa', '#00897b', '#6d4c41', '#5e35b1', '#c0ca33', '#00acc1', '#f4511e', '#3949ab'];

  const st = {
    elections: [], el: null, live: null, cargo: '1', turno: 0, region: 'all', uf: 'pe', detail: null, mun: null,
    cand: null, q: '', mq: '', resumo: false, loading: false, err: null, v: null, ready: false,
  };
  let mounted = null, timer = null, loadSeq = 0;
  const jsonCache = {};

  // ---------- utilidades ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = s => parseFloat(String(s == null ? '0' : s).replace(',', '.')) || 0;
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase();
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const pct = v => (v || 0).toFixed(1).replace('.', ',') + '%';
  const intl = v => (v || 0).toLocaleString('pt-BR');
  function votos(v) {
    v = v || 0;
    if (v >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + ' mi';
    if (v >= 1e4) return Math.round(v / 1e3) + ' mil';
    if (v >= 1e3) return (v / 1e3).toFixed(1).replace('.', ',') + ' mil';
    return String(v);
  }
  function titleCase(s) {
    return String(s || '').toLowerCase().replace(/(^|[\s(])(\S)/g, (m, a, b) => a + b.toUpperCase())
      .replace(/\b(Da|De|Do|Das|Dos|E)\b/g, w => w.toLowerCase());
  }
  function partyColor(sg) {
    const k = norm(sg);
    if (PARTY_COLORS[k]) return PARTY_COLORS[k];
    let h = 0; for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return FALLBACK[h % FALLBACK.length];
  }
  const ckey = c => c.n + '|' + norm(c.partido);
  const regionUfs = () => st.region === 'all' ? UFS : REG[st.region].ufs;
  const E = () => st.elections.find(e => e.id === st.el);
  const cargoUf = (cargo, uf) => (cargo === '7' && uf === 'df') ? '8' : cargo;

  async function pool(items, n, fn) {
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) { const it = items[i++]; try { await fn(it); } catch (e) { /* item sem dados */ } }
    }));
  }

  // ---------- acesso aos dados ----------
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
  async function getJson(name) {
    if (jsonCache[name]) return jsonCache[name];
    const res = await fetch(HIST + name + '?v=' + Math.floor(Date.now() / 3.6e6));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return (jsonCache[name] = await res.json());
  }
  const dmy = s => { const [d, m, y] = String(s || '').split('/').map(Number); return new Date(y, m - 1, d).getTime() || 0; };

  async function discover() {
    const cfg = await getJws(`${BASE}/comum/config/ele-c.jws`);
    const found = {};
    (cfg.pl || []).forEach(pl => (pl.e || []).forEach(e => {
      if (e.t !== '1') return;
      (e.abr || []).forEach(ab => (ab.cp || []).forEach(cp => {
        const key = cp.cd === '1' ? 'pres' : cp.cd === '3' ? 'est' : null;
        if (!key) return;
        const when = dmy(pl.dt);
        if (!found[key] || when > found[key].when) found[key] = { when, ciclo: pl.c, t1: e.cd, t2: e.cdt2 || '', ano: +String(pl.dt || '').slice(-4) };
      }));
    }));
    return found;
  }

  async function initElections() {
    const list = [];
    try {
      const live = await discover();
      st.live = live;
      if (live.pres || live.est) {
        const cargos = {};
        if (live.pres) cargos['1'] = live.pres.t2 ? [1, 2] : [1];
        if (live.est) { cargos['3'] = live.est.t2 ? [1, 2] : [1]; cargos['5'] = [1]; cargos['6'] = [1]; cargos['7'] = [1]; }
        list.push({ id: 'live', ano: (live.pres || live.est).ano, tipo: 'geral', live: true, cargos });
      }
    } catch (e) { st.err = 'TSE ao vivo indisponível (' + e.message + ')'; }
    try {
      const idx = await getJson('index.json');
      idx.forEach(e => {
        if (list.some(x => x.ano === e.ano)) return;
        const cargos = {};
        Object.entries(e.cargos || {}).forEach(([c, t]) => { if (CARGO[c]) cargos[c] = t; });
        list.push({ id: 'h' + e.ano, ano: e.ano, tipo: e.tipo, cargos });
      });
    } catch (e) { /* resumos ainda não gerados */ }
    list.sort((a, b) => b.ano - a.ano);
    st.elections = list;
    if (!st.el && list.length) selectElection(list[0].id);
  }

  function selectElection(id) {
    st.el = id;
    const e = E();
    if (!e) return;
    if (!e.cargos[st.cargo]) st.cargo = e.cargos['1'] ? '1' : e.cargos['11'] ? '11' : Object.keys(e.cargos)[0];
    selectCargo(st.cargo);
  }
  function selectCargo(c) {
    st.cargo = c; st.cand = null; st.q = ''; st.detail = null;
    const t = (E() && E().cargos[c]) || [1];
    st.turno = c === '1' ? Math.max(...t) : Math.min(...t);
  }

  // resultado normalizado
  function fromLive(d, ele, info, uf) {
    const c = (d.carg || [])[0] || {};
    const cands = [];
    (c.agr || []).forEach(a => (a.par || []).forEach(p => (p.cand || []).forEach(x => cands.push({
      n: x.n, nome: x.nmu || x.nm, partido: p.sg, votos: +x.vap || 0, pct: num(x.pvapn || x.pvap),
      eleito: x.e === 's', sit: x.e === 's' ? 'e' : '', foto: `${BASE}/${info.ciclo}/${ele}/fotos/${uf}/${x.sqcand}.jpeg`,
    }))));
    cands.sort((x, y) => y.votos - x.votos);
    const e = d.e || {}, v = d.v || {};
    return {
      cands, total: cands.reduce((s, x) => s + x.votos, 0), final: d.tf === 's', live: true,
      secoes: num(d.s && (d.s.pstn || d.s.pst)), hora: `${d.dt || d.dg || ''} ${d.ht || d.hg || ''}`.trim(),
      det: { aptos: +e.te || 0, comp: +e.c || 0, abst: +e.a || 0, validos: +v.vv || 0, brancos: +v.vb || 0, nulos: +v.tvn || 0 },
    };
  }
  const detArr = a => a ? { aptos: a[0], comp: a[1], abst: a[2], validos: a[3], brancos: a[4], nulos: a[5] } : null;
  function fromHist(list, det) {
    const total = (list || []).reduce((s, x) => s + x[3], 0) || 1;
    const cands = (list || []).map(x => ({ n: x[0], nome: x[1], partido: x[2], votos: x[3], pct: x[3] / total * 100, eleito: x[4] === 'e', sit: x[4], foto: null }));
    return { cands, total: cands.reduce((s, x) => s + x.votos, 0), final: true, secoes: 100, hora: '', det: detArr(det) };
  }
  function sumDet(ds) {
    const out = { aptos: 0, comp: 0, abst: 0, validos: 0, brancos: 0, nulos: 0 };
    let any = false;
    ds.forEach(d => { if (!d) return; any = true; Object.keys(out).forEach(k => { out[k] += d[k] || 0; }); });
    return any ? out : null;
  }
  // soma de vários estados (usado no filtro de região)
  function aggregate(results) {
    const map = {};
    let secW = 0, secN = 0;
    results.forEach(r => {
      if (!r) return;
      secW += r.secoes; secN++;
      r.cands.forEach(c => { const k = ckey(c); if (!map[k]) map[k] = Object.assign({}, c, { votos: 0 }); map[k].votos += c.votos; });
    });
    const cands = Object.values(map).sort((a, b) => b.votos - a.votos);
    const total = cands.reduce((s, c) => s + c.votos, 0) || 1;
    cands.forEach(c => { c.pct = c.votos / total * 100; c.eleito = false; });
    return { cands, total, secoes: secN ? secW / secN : 0, final: results.every(r => !r || r.final), det: sumDet(results.map(r => r && r.det)), hora: '' };
  }

  async function load() {
    const seq = ++loadSeq;
    const e = E();
    if (!e) return;
    const cargo = st.cargo, turno = st.turno;
    const v = { ufs: {}, main: null, national: null, munList: null, munName: '', note: '' };
    if (e.live) {
      const info = cargo === '1' ? st.live.pres : st.live.est;
      const ele = turno === 2 ? info.t2 : info.t1;
      const url = (uf, c) => `${BASE}/${info.ciclo}/${ele}/dados/${uf}/${uf}-c${c.padStart(4, '0')}-e${ele.padStart(6, '0')}-u.jws`;
      if (cargo === '1') v.national = fromLive(await getJws(url('br', '1')), ele, info, 'br');
      await pool(UFS, 8, async uf => { v.ufs[uf] = fromLive(await getJws(url(uf, cargoUf(cargo, uf))), ele, info, uf); });
    } else if (e.tipo === 'geral') {
      const g = await getJson(`g${e.ano}.json`);
      const d = (g.d && g.d[cargo]) || {};
      if (!PROP.has(cargo)) {
        const t = ((g.c[cargo] || {})[turno]) || {};
        const dt = d[turno] || {};
        UFS.forEach(uf => { if (t[uf]) v.ufs[uf] = fromHist(t[uf], dt[uf]); });
        if (cargo === '1' && t.br) v.national = fromHist(t.br, dt.br);
      } else {
        UFS.forEach(uf => {
          const c = cargoUf(cargo, uf);
          const r = (((g.r[c] || {})['1']) || {})[uf];
          if (r) v.ufs[uf] = { summary: true, total: r.v, top: r.t ? fromHist([r.t]).cands[0] : null, secoes: 100, final: true, det: detArr(((g.d[c] || {})['1'] || {})[uf]) };
          if (v.ufs[uf] && v.ufs[uf].top) v.ufs[uf].top.pct = r.t[3] / (r.v || 1) * 100;
        });
        const f = await getJson(`g${e.ano}-${st.uf}.json`);
        const c = cargoUf(cargo, st.uf);
        v.main = fromHist(f[c] || [], ((g.d[c] || {})['1'] || {})[st.uf]);
      }
    } else {
      const m = await getJson(`m${e.ano}.json`);
      const rr = (m.r && m.r[cargo]) || {};
      const dd = ((m.d && m.d[cargo]) || {})[turno] || ((m.d && m.d[cargo]) || {})['1'] || {};
      UFS.forEach(uf => {
        const r = rr[uf];
        if (!r) return;
        if (cargo === '11') {
          const top = Object.entries(r.p || {})[0];
          v.ufs[uf] = { summary: true, total: r.v, pref: r.p, mcount: r.m, top: top ? { partido: top[0], n: '', nome: '', votos: 0, pct: 0, count: top[1] } : null, secoes: 100, final: true, det: detArr(dd[uf]) };
        } else {
          v.ufs[uf] = { summary: true, total: r.v, top: r.t ? Object.assign(fromHist([r.t]).cands[0], { pct: r.t[3] / (r.v || 1) * 100, mun: r.t[5] }) : null, secoes: 100, final: true, det: detArr(dd[uf]) };
        }
      });
      const f = await getJson(`m${e.ano}-${st.uf}.json`);
      v.munList = Object.entries(f.mun || {}).map(([cd, nm]) => ({ cd, nm })).sort((a, b) => a.nm.localeCompare(b.nm));
      if (!st.mun || !f.mun[st.mun]) {
        const cabo = v.munList.find(x => fold(x.nm) === 'cabo de santo agostinho');
        const t1 = (f['11'] || {})['1'] || {};
        const biggest = Object.entries(t1).map(([cd, l]) => [cd, l.reduce((s, x) => s + x[3], 0)]).sort((a, b) => b[1] - a[1])[0];
        st.mun = cabo ? cabo.cd : biggest ? biggest[0] : (v.munList[0] || {}).cd;
      }
      v.munName = (f.mun || {})[st.mun] || '';
      const det = (((f.d || {})[cargo] || {})[turno] || {})[st.mun];
      if (cargo === '11') {
        const lst = (((f['11'] || {})[turno]) || {})[st.mun];
        if (lst) v.main = fromHist(lst, det); else v.note = turno === 2 ? 'Não houve 2º turno neste município.' : 'Sem dados para este município.';
      } else {
        const fv = await getJson(`m${e.ano}-${st.uf}-ver.json`);
        v.main = fromHist((((fv['13'] || {})['1']) || {})[st.mun] || [], det);
      }
    }
    if (seq !== loadSeq) return;
    st.v = v;
  }

  async function refresh() {
    if (st.loading) return;
    st.loading = true; paint();
    try {
      if (!st.ready) { await initElections(); st.ready = true; }
      if (!st.elections.length) throw new Error(st.err || 'sem eleições disponíveis');
      await load();
      st.err = null;
    } catch (e) {
      st.err = e.message || 'erro de conexão';
    }
    st.loading = false; paint();
  }

  // ---------- visão atual ----------
  function mainResult() {
    const v = st.v;
    if (!v) return null;
    if (st.cargo === '1') {
      if (st.region === 'all') return v.national || aggregate(UFS.map(u => v.ufs[u]));
      const r = aggregate(regionUfs().map(u => v.ufs[u]));
      r.region = true;
      return r;
    }
    if (st.cargo === '3' || st.cargo === '5') return v.ufs[st.uf] || null;
    if (PROP.has(st.cargo) && E() && E().live) return v.ufs[st.uf] || null;
    return v.main;
  }
  function scopeName() {
    const e = E();
    if (st.cargo === '1') return st.region === 'all' ? 'Brasil' : REG[st.region].nm;
    if (e && e.tipo === 'municipal') return titleCase(st.v && st.v.munName) + ' – ' + st.uf.toUpperCase();
    return UF_NOME[st.uf];
  }
  function scopeDet() {
    const r = mainResult();
    if (st.cargo === '1' && st.region === 'all' && st.v && st.v.national) return st.v.national.det;
    return r ? r.det : null;
  }

  // ---------- desenho ----------
  function photo(c, color) {
    const ini = titleCase(c.nome).split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('');
    return `<div class="dc-photo" style="--pc:${color}">${c.foto ? `<img src="${esc(c.foto)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<span>${esc(ini)}</span></div>`;
  }
  function duel(r, small) {
    if (!r || !r.cands.length) return '';
    const a = r.cands[0], b = r.cands[1];
    const ca = partyColor(a.partido);
    let cb = b ? partyColor(b.partido) : '#777';
    if (ca === cb) cb = '#9e9e9e';
    const canFilter = !small && (st.cargo === '1');
    const cand = (c, side, color) => `
      <div class="dc ${side} ${canFilter ? 'clickable' : ''} ${st.cand === ckey(c) ? 'on' : ''}" ${canFilter ? `data-ele-cand="${esc(ckey(c))}"` : ''}>
        ${photo(c, color)}
        <div class="dc-txt">
          <strong>${esc(titleCase(c.nome))}${c.eleito ? ' <span class="ok">✔</span>' : ''}</strong>
          <small><span class="pt" style="background:${color}">${esc(c.partido)}</span> ${esc(c.n)}</small>
          ${canFilter ? '<em>toque para filtrar</em>' : ''}
        </div>
      </div>`;
    if (!b) return `<div class="duel"><div class="duel-cands">${cand(a, 'l', ca)}</div><div class="duel-bar"><div class="seg" style="width:100%;background:${ca}"><b>${pct(a.pct)}</b><span>${votos(a.votos)}</span></div></div></div>`;
    const tot = (a.pct + b.pct) || 1;
    const wa = Math.max(8, Math.min(92, a.pct / tot * 100));
    return `
      <div class="duel ${small ? 'small' : ''}">
        <div class="duel-cands">${cand(a, 'l', ca)}${cand(b, 'r', cb)}</div>
        <div class="duel-bar">
          <div class="seg" style="width:${wa}%;background:${ca}"><b>${pct(a.pct)}</b>${wa >= 34 ? `<span>${votos(a.votos)}</span>` : ''}</div>
          <div class="seg r" style="width:${100 - wa}%;background:${cb}">${100 - wa >= 34 ? `<span>${votos(b.votos)}</span>` : ''}<b>${pct(b.pct)}</b></div>
          <i class="mid"></i>
        </div>
        ${r.cands.length > 2 && !small ? `<div class="others">${r.cands.slice(2, 10).filter(c => c.votos > 0).map(c =>
          `<div class="oth ${canFilter ? 'clickable' : ''} ${st.cand === ckey(c) ? 'on' : ''}" ${canFilter ? `data-ele-cand="${esc(ckey(c))}"` : ''}><i style="background:${partyColor(c.partido)}"></i><span>${esc(titleCase(c.nome))} <small>${esc(c.partido)} ${esc(c.n)}</small></span><b>${pct(c.pct)}</b><small>${votos(c.votos)}</small></div>`).join('')}</div>` : ''}
      </div>`;
  }
  function rankingHtml(r) {
    if (!r) return '';
    const q = fold(st.q);
    const list = r.cands.map((c, i) => Object.assign({ pos: i + 1 }, c)).filter(c => !q || fold(c.nome).includes(q) || fold(c.partido).includes(q) || String(c.n).startsWith(q));
    const sitTxt = { e: 'eleito', s: 'suplente', '2': '2º turno' };
    return list.slice(0, 60).map(c => `
      <div class="rk">
        <span class="pos">${c.pos}º</span>
        <i style="background:${partyColor(c.partido)}"></i>
        <span class="nm">${esc(titleCase(c.nome))} <small>${esc(c.partido)} ${esc(c.n)}</small></span>
        <span class="vv"><b>${votos(c.votos)}</b><small>${pct(c.pct)}</small></span>
        ${sitTxt[c.sit] ? `<span class="sit ${c.sit === 'e' ? 'e' : ''}">${sitTxt[c.sit]}</span>` : ''}
      </div>`).join('') + (list.length > 60 ? `<p class="ele-hint">Mostrando 60 de ${list.length}. Use a busca para achar outros.</p>` : '') + (!list.length ? '<p class="ele-hint">Nenhum candidato encontrado.</p>' : '');
  }
  function munListHtml() {
    const v = st.v;
    if (!v || !v.munList) return '';
    const q = fold(st.mq);
    if (!q) return '';
    const list = v.munList.filter(m => fold(m.nm).includes(q)).slice(0, 10);
    return list.map(m => `<button class="mun-opt" data-ele-mun="${esc(m.cd)}">${esc(titleCase(m.nm))}</button>`).join('') || '<p class="ele-hint">Nenhuma cidade encontrada.</p>';
  }

  function candIn(r) {
    if (!r || !r.cands || !st.cand) return null;
    return r.cands.find(c => ckey(c) === st.cand) || null;
  }
  function ufInfo(uf) {
    const r = st.v && st.v.ufs[uf];
    const e = E();
    if (!r) return { color: '#2a3a33', op: 1, empty: true, l1: st.turno === 2 ? 'sem 2º turno' : 'sem dados', l2: '' };
    const ap = `${pct(r.secoes)} apurado`;
    if (st.cand && r.cands) {
      const c = candIn(r);
      if (!c) return { color: '#2a3a33', op: 1, l1: ap, l2: 'não concorreu', tag: '' };
      return { color: partyColor(c.partido), op: 0.25 + Math.min(c.pct, 80) / 80 * 0.75, l1: ap, l2: `${pct(c.pct)} · ${votos(c.votos)}`, mapPct: pct(c.pct), mapVotes: votos(c.votos) };
    }
    if (r.cands) {
      const a = r.cands[0], b = r.cands[1];
      if (!a || !a.votos) return { color: '#2a3a33', op: 1, l1: ap, l2: '0 votos' };
      const margin = a.pct - (b ? b.pct : 0);
      return { color: partyColor(a.partido), op: 0.5 + Math.min(margin, 30) / 30 * 0.5, l1: ap, l2: `${votos(r.total)} votos`, tag: `${a.partido} ${pct(a.pct)}` };
    }
    if (r.pref) {
      const top = r.top;
      return { color: top ? partyColor(top.partido) : '#2a3a33', op: 0.85, l1: `${r.mcount} cidades`, l2: `${votos(r.total)} votos`, tag: top ? `${top.partido} ${top.count} pref.` : '' };
    }
    const top = r.top;
    return { color: top ? partyColor(top.partido) : '#2a3a33', op: 0.85, l1: e && e.live ? ap : '100% apurado', l2: `${votos(r.total)} votos`, tag: top ? `+votado: ${top.partido}` : '' };
  }

  function mapSvg() {
    const M = window.BR_MAP;
    if (!M) return '<div class="ele-msg">Mapa indisponível.</div>';
    const inReg = new Set(regionUfs());
    const sel = (st.cargo === '1') ? st.detail : st.uf;
    const paths = M.locations.map(l => {
      const i = ufInfo(l.id);
      const dim = !inReg.has(l.id);
      return `<path d="${l.path}" data-ele-uf="${l.id}" fill="${i.color}" fill-opacity="${(dim ? 0.12 : i.op).toFixed(2)}" class="${sel === l.id ? 'sel' : ''}"></path>`;
    }).join('');
    return `<svg class="br-map" viewBox="0 0 613 639">${paths}<g class="lbl"></g></svg>`;
  }
  function placeLabels(svg) {
    const g = svg.querySelector('g.lbl');
    if (!g) return;
    const NS = 'http://www.w3.org/2000/svg';
    const inReg = new Set(regionUfs());
    const ADJ = { go: [-14, 18], df: [6, -2], mg: [6, 8], pi: [-4, 8], ba: [-14, 10], sc: [6, 2], rj: [10, 6], es: [8, 4], ma: [-8, 10], pa: [0, 10], am: [0, 6], ms: [4, 4], to: [0, 6], ap: [0, 6], rr: [0, 4], ac: [0, 4], ro: [0, 4], rn: [4, 0], pb: [10, 2], pe: [16, 0], al: [6, 2], se: [2, 2] };
    svg.querySelectorAll('path[data-ele-uf]').forEach(p => {
      const uf = p.dataset.eleUf;
      if (!inReg.has(uf)) return;
      const b = p.getBBox();
      const adj = ADJ[uf] || [0, 0];
      const x = b.x + b.width / 2 + adj[0], y = b.y + b.height / 2 + adj[1];
      const info = ufInfo(uf);
      const small = SMALL.has(uf);
      if (small) info.mapPct = null;
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', x); t.setAttribute('y', y - (info.mapPct ? 9 : 0));
      if (small) t.setAttribute('class', 'tiny');
      t.textContent = uf.toUpperCase();
      g.appendChild(t);
      if (info.mapPct) {
        const t2 = document.createElementNS(NS, 'text');
        t2.setAttribute('x', x); t2.setAttribute('y', y + (small ? 5 : 7));
        t2.setAttribute('class', small ? 'val tiny' : 'val');
        t2.textContent = info.mapPct;
        g.appendChild(t2);
        if (!small) {
          const t3 = document.createElementNS(NS, 'text');
          t3.setAttribute('x', x); t3.setAttribute('y', y + 21);
          t3.setAttribute('class', 'val2');
          t3.textContent = info.mapVotes;
          g.appendChild(t3);
        }
      }
    });
  }
  function ufCards(regs) {
    return regs.filter(k => st.region === 'all' || st.region === k).map(k => `
      <div class="ufgrp"><h4>${REG[k].nm}</h4>
        ${REG[k].ufs.map(uf => {
          const i = ufInfo(uf);
          const sel = (st.cargo === '1' ? st.detail : st.uf) === uf;
          return `<button class="ufc ${sel ? 'sel' : ''} ${i.empty ? 'empty' : ''}" data-ele-uf="${uf}" style="--uc:${i.color}">
            <b>${uf.toUpperCase()}</b><span>${esc(i.l1)}</span><span class="v">${esc(i.l2)}</span>${i.tag ? `<small>${esc(i.tag)}</small>` : ''}
          </button>`;
        }).join('')}
      </div>`).join('');
  }
  function legend() {
    const v = st.v;
    if (!v) return '';
    if (st.cand) {
      const any = Object.values(v.ufs).map(candIn).find(Boolean) || (mainResult() && candIn(mainResult()));
      const col = any ? partyColor(any.partido) : '#888';
      return `<div class="ele-legend"><span class="grad" style="--gc:${col}"></span><em>menos votos</em> → <em>mais votos</em></div>`;
    }
    const count = {};
    regionUfs().forEach(uf => {
      const r = v.ufs[uf];
      if (!r) return;
      if (r.pref) { Object.entries(r.pref).forEach(([p, n]) => { count[p] = (count[p] || 0) + n; }); return; }
      const a = r.cands ? r.cands[0] : r.top;
      if (a && (a.votos || a.count)) count[a.partido] = (count[a.partido] || 0) + 1;
    });
    const items = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (!items.length) return '';
    const unit = st.cargo === '11' ? 'prefeituras' : PROP.has(st.cargo) ? 'estados (mais votado)' : 'estados';
    return `<div class="ele-legend">${items.map(([p, n]) => `<span><i style="background:${partyColor(p)}"></i>${esc(p)} <b>${n}</b></span>`).join('')} <em>${unit}</em></div>`;
  }
  function resumoHtml() {
    const d = scopeDet();
    if (!d) return `<div class="resumo"><p class="ele-hint">Resumo dos votos indisponível para esta seleção.</p></div>`;
    const comp = d.comp || 1, aptos = d.aptos || 1;
    const row = (lbl, val, base, cls) => `<div class="rs ${cls || ''}"><span>${lbl}</span><b>${intl(val)}</b><em>${pct(val / base * 100)}</em><i style="width:${Math.min(100, val / base * 100)}%"></i></div>`;
    return `<div class="resumo">
      <h4>Resumo dos votos · ${esc(scopeName())}</h4>
      ${row('Eleitores aptos', d.aptos, aptos, 'muted')}
      ${row('Comparecimento', d.comp, aptos)}
      ${row('Abstenção', d.abst, aptos, 'warn')}
      <div class="rs-sep">Dos votos de quem compareceu</div>
      ${row('Votos válidos', d.validos, comp, 'ok')}
      ${row('Votos brancos', d.brancos, comp, 'branco')}
      ${row('Votos nulos', d.nulos, comp, 'nulo')}
      <p class="ele-hint">Total de votos: <b>${intl(d.validos + d.brancos + d.nulos)}</b>. Percentuais de válidos, brancos e nulos sobre o comparecimento; comparecimento e abstenção sobre o eleitorado.</p>
    </div>`;
  }

  function paint() {
    if (!mounted) return;
    const { container, header } = mounted;
    const e = E();
    const v = st.v;
    const r = mainResult();
    const isProp = PROP.has(st.cargo);
    const muni = e && e.tipo === 'municipal';
    const turnos = (e && e.cargos[st.cargo]) || [1];

    let title = e ? (e.live ? 'Apuração oficial do TSE' : `Eleições ${e.ano}`) : 'Votação';
    if (r && r.cands && r.cands.length && !isProp) {
      const w = r.cands.find(c => c.eleito);
      if (st.cargo === '1' && !r.region) title = w ? `${titleCase(w.nome)} ${e.live ? 'é eleito' : 'foi eleito'} presidente` : (r.final ? (st.turno === 1 && turnos.includes(2) ? 'Presidente: disputa foi ao 2º turno' : `Presidente · ${e.ano}`) : `Apuração: ${pct(r.secoes)} das seções`);
      else if (st.cargo === '1') title = `Presidente · ${REG[st.region].nm}`;
      else title = `${CARGO[st.cargo][0]} · ${scopeName()}` + (w ? ` — ${titleCase(w.nome)} venceu` : '');
    } else if (isProp || muni) title = `${CARGO[st.cargo][0]} · ${scopeName()}`;

    const scroll = window.scrollY;
    const focusId = document.activeElement && document.activeElement.id;
    container.innerHTML = header + `
      <main class="ele">
        <div class="ele-filters">
          <label>Eleição<select data-ele-sel="el">${st.elections.map(x => `<option value="${x.id}" ${x.id === st.el ? 'selected' : ''}>${x.ano} · ${x.live ? 'ao vivo' : x.tipo === 'municipal' ? 'municipais' : 'gerais'}</option>`).join('') || '<option>carregando…</option>'}</select></label>
          <label>Região<select data-ele-sel="region"><option value="all">Brasil todo</option>${Object.entries(REG).map(([k, x]) => `<option value="${k}" ${st.region === k ? 'selected' : ''}>${x.nm}</option>`).join('')}</select></label>
        </div>
        <div class="ele-tabs">${e ? Object.keys(e.cargos).sort((a, b) => a - b).map(c => `<button class="${c === st.cargo ? 'on' : ''}" data-ele-cargo="${c}">${CARGO[c][1]}</button>`).join('') : ''}</div>

        <div class="ele-head">
          <h2>${esc(title)}</h2>
          <div class="turnos">${turnos.map(t => `<button class="${t === st.turno ? 'on' : ''}" data-ele-turno="${t}">${t}º turno</button>`).join('')}</div>
        </div>

        ${st.cand ? `<div class="cand-banner">Mostrando só os votos de <b>${esc(titleCase(((r && candIn(r)) || {}).nome || 'candidato'))}</b> nos estados <button data-ele-cand="${esc(st.cand)}">✕ limpar</button></div>` : ''}

        ${muni ? `<div class="mun-pick">
            <div class="mun-cur">📍 <b>${esc(titleCase(v && v.munName))}</b> – ${st.uf.toUpperCase()} <small>(toque no mapa para trocar de estado)</small></div>
            <input id="ele-mq" class="ele-input" placeholder="Buscar cidade em ${esc(UF_NOME[st.uf])}…" value="${esc(st.mq)}" autocomplete="off">
            <div id="ele-munlist">${munListHtml()}</div>
          </div>` : ''}

        ${!v ? `<div class="ele-msg">${st.err ? 'Não foi possível carregar (' + esc(st.err) + ').' : 'Carregando dados oficiais do TSE…'}</div>`
          : isProp ? `<div class="rank-box">
              <input id="ele-q" class="ele-input" placeholder="Buscar candidato, partido ou número…" value="${esc(st.q)}" autocomplete="off">
              <div id="ele-rank">${rankingHtml(r)}</div></div>`
          : (r && r.cands.length ? duel(r) : `<div class="ele-msg">${esc((v && v.note) || (st.turno === 2 ? `${st.cargo === '1' ? 'Não houve' : UF_NOME[st.uf] + ' não teve'} 2º turno nesta eleição — toque em “1º turno”.` : 'Sem dados para esta seleção.'))}</div>`)}

        <button class="ele-resumo-btn ${st.resumo ? 'on' : ''}" data-ele-resumo>📊 Resumo dos votos (válidos, brancos, nulos, abstenção)</button>
        ${st.resumo ? resumoHtml() : ''}

        <div class="ele-mapwrap">
          <div class="side l">${ufCards(LEFT)}</div>
          <div class="ele-map">${mapSvg()}</div>
          <div class="side r">${ufCards(RIGHT)}</div>
        </div>
        ${legend()}
        <p class="ele-hint">${st.cargo === '1' ? 'Toque na foto de um candidato para ver só os votos dele. Toque em um estado para ver o resultado local.' : muni ? 'Toque em um estado para escolher as cidades dele.' : 'Toque em um estado para ver a disputa.'}</p>

        ${st.cargo === '1' && st.detail && v && v.ufs[st.detail] ? `<div class="ele-uf"><h3>${esc(UF_NOME[st.detail])} · ${pct(v.ufs[st.detail].secoes)} apurado · ${votos(v.ufs[st.detail].total)} votos</h3>${duel(v.ufs[st.detail], true)}</div>` : ''}

        <div class="ele-foot">
          ${r && r.hora ? `Atualizado pelo TSE em ${esc(r.hora)}<br>` : ''}
          ${st.err && v ? `<span class="err">Última tentativa falhou: ${esc(st.err)}</span><br>` : ''}
          <span class="refresh" data-ele-refresh>${st.loading ? 'Carregando…' : '↻ Atualizar agora'}</span>
          <small>${e && e.live ? 'Ao vivo: atualiza sozinho a cada minuto.' : 'Resultados finais.'} Fonte: TSE (resultados e Dados Abertos). Mapa: @svg-maps/brazil, CC BY 4.0.</small>
        </div>
      </main>`;
    window.scrollTo(0, scroll);
    if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); const n = el.value.length; el.setSelectionRange(n, n); } }
    const svg = container.querySelector('svg.br-map');
    if (svg) placeLabels(svg);
  }

  // ---------- interação ----------
  function onClick(ev) {
    if (!mounted) return;
    const t = ev.target.closest('[data-ele-cargo],[data-ele-turno],[data-ele-uf],[data-ele-cand],[data-ele-resumo],[data-ele-refresh],[data-ele-mun]');
    if (!t) return;
    const d = t.dataset;
    if (d.eleCargo) { if (d.eleCargo !== st.cargo) { selectCargo(d.eleCargo); st.v = null; paint(); refresh(); } return; }
    if (d.eleTurno) { const n = +d.eleTurno; if (n !== st.turno) { st.turno = n; st.cand = null; st.v = null; paint(); refresh(); } return; }
    if (d.eleCand) { st.cand = st.cand === d.eleCand ? null : d.eleCand; paint(); return; }
    if (t.hasAttribute('data-ele-resumo')) { st.resumo = !st.resumo; paint(); return; }
    if (t.hasAttribute('data-ele-refresh')) { refresh(); return; }
    if (d.eleMun) { st.mun = d.eleMun; st.mq = ''; refresh(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (d.eleUf) {
      const uf = d.eleUf;
      const e = E();
      if (st.cargo === '1') {
        st.detail = st.detail === uf ? null : uf; paint();
        const box = mounted.container.querySelector('.ele-uf'); if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (uf === st.uf) return;
      st.uf = uf; st.q = '';
      if (e && e.tipo === 'municipal') { st.mun = null; st.mq = ''; }
      if (st.cargo === '3' || st.cargo === '5') paint(); else refresh();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
  function onChange(ev) {
    const s = ev.target.closest('[data-ele-sel]');
    if (!s || !mounted) return;
    if (s.dataset.eleSel === 'el') { selectElection(s.value); st.v = null; st.mun = null; paint(); refresh(); }
    if (s.dataset.eleSel === 'region') { st.region = s.value; st.detail = null; paint(); }
  }
  function onInput(ev) {
    if (!mounted) return;
    if (ev.target.id === 'ele-q') { st.q = ev.target.value; const box = document.getElementById('ele-rank'); if (box) box.innerHTML = rankingHtml(mainResult()); }
    if (ev.target.id === 'ele-mq') { st.mq = ev.target.value; const box = document.getElementById('ele-munlist'); if (box) box.innerHTML = munListHtml(); }
  }

  window.Eleicao = {
    mount(container, header) {
      mounted = { container, header };
      if (!container.__eleBound) {
        container.addEventListener('click', onClick);
        container.addEventListener('change', onChange);
        container.addEventListener('input', onInput);
        container.__eleBound = true;
      }
      paint();
      refresh();
      clearInterval(timer);
      timer = setInterval(() => {
        const e = E(), r = mainResult();
        if (e && e.live && !(r && r.final)) refresh();
      }, REFRESH_MS);
    },
    unmount() { mounted = null; clearInterval(timer); timer = null; },
  };
})();
