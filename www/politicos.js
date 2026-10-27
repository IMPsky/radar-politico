/* Info Políticos: mapa Brasil → estado → cidade → bairro, com foto e nome de quem atua em cada lugar,
   e um card com a carreira e o que cada político fez (dados oficiais: TSE, Câmara, Senado, câmaras municipais). */
(function () {
  'use strict';

  const DATA = 'https://raw.githubusercontent.com/IMPsky/radar-politico/main/data/politicos/';
  const IBGE = 'https://servicodados.ibge.gov.br/api';
  const CAMARA = 'https://dadosabertos.camara.leg.br/api/v2';
  const SENADO = 'https://legis.senado.leg.br/dadosabertos';
  const DIVULGA = 'https://divulgacandcontas.tse.jus.br/divulga';
  const A = () => window.App;
  const NS = 'http://www.w3.org/2000/svg';

  const UFS = {
    AC: ['Acre', '1200401'], AL: ['Alagoas', '2704302'], AM: ['Amazonas', '1302603'], AP: ['Amapá', '1600303'], BA: ['Bahia', '2927408'],
    CE: ['Ceará', '2304400'], DF: ['Distrito Federal', '5300108'], ES: ['Espírito Santo', '3205309'], GO: ['Goiás', '5208707'],
    MA: ['Maranhão', '2111300'], MG: ['Minas Gerais', '3106200'], MS: ['Mato Grosso do Sul', '5002704'], MT: ['Mato Grosso', '5103403'],
    PA: ['Pará', '1501402'], PB: ['Paraíba', '2507507'], PE: ['Pernambuco', '2611606'], PI: ['Piauí', '2211001'], PR: ['Paraná', '4106902'],
    RJ: ['Rio de Janeiro', '3304557'], RN: ['Rio Grande do Norte', '2408102'], RO: ['Rondônia', '1100205'], RR: ['Roraima', '1400100'],
    RS: ['Rio Grande do Sul', '4314902'], SC: ['Santa Catarina', '4205407'], SE: ['Sergipe', '2800308'], SP: ['São Paulo', '3550308'], TO: ['Tocantins', '1721000'],
  };
  const CARGOS = {
    gov: 'Governador(a)', sen: 'Senador(a)', depf: 'Deputado(a) federal', depe: 'Deputado(a) estadual', depd: 'Deputado(a) distrital',
    pref: 'Prefeito(a)', ver: 'Vereador(a)',
  };
  const CHIPS = [
    ['todos', 'Todos'], ['gov', 'Governador'], ['sen', 'Senadores'], ['depf', 'Dep. federais'], ['depe', 'Dep. estaduais'], ['pref', 'Prefeitos'], ['ver', 'Vereadores'],
  ];
  const PARTY = {
    PT: '#e5383b', PCDOB: '#b71c1c', PSB: '#ff7a3d', PDT: '#d9480f', PSOL: '#c2185b', REDE: '#26a69a', PV: '#2e9e4f',
    PL: '#3d5afe', PP: '#1e88e5', REPUBLICANOS: '#00838f', UNIAO: '#1565c0', NOVO: '#fb8c00', PSDB: '#0277bd',
    PSD: '#f2b632', MDB: '#43a047', PODE: '#7e57c2', SOLIDARIEDADE: '#ef6c00', AVANTE: '#9ccc65', CIDADANIA: '#ec407a',
    PRD: '#8d6e63', MISSAO: '#546e7a', PMB: '#ad1457', AGIR: '#5c6bc0', DC: '#6d4c41', PSTU: '#c62828', PCO: '#8e0000', UP: '#d32f2f', PCB: '#9a0007', PMN: '#ab47bc',
  };
  const FALLBACK = ['#8e24aa', '#00897b', '#6d4c41', '#5e35b1', '#c0ca33', '#00acc1', '#f4511e', '#3949ab'];

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const compact = s => fold(s).replace(/\b(DE|DA|DO|DAS|DOS|E|D)\b/g, '').replace(/\s+/g, '');
  const intl = v => (v || 0).toLocaleString('pt-BR');
  const pct = v => (v || 0).toFixed(1).replace('.', ',') + '%';
  const https = u => String(u || '').replace(/^http:\/\//, 'https://');
  function partyColor(sg) {
    const k = fold(sg).replace(/\s/g, '');
    if (PARTY[k]) return PARTY[k];
    let h = 0; for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return FALLBACK[h % FALLBACK.length];
  }
  const iniciais = n => String(n || '?').split(/\s+/).filter(w => w.length > 2 || /^[A-Z]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  // ---------- rede (com cache) ----------
  const mem = new Map();
  async function getJSON(url, opts) {
    opts = opts || {};
    if (!opts.fresh && mem.has(url)) return mem.get(url);
    const lsKey = opts.cache ? 'ipc:' + url : null;
    if (lsKey && !opts.fresh) {
      try { const c = JSON.parse(localStorage.getItem(lsKey) || 'null'); if (c && Date.now() - c.t < opts.cache) { mem.set(url, c.d); return c.d; } } catch (e) { /* sem cache */ }
    }
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), opts.timeout || 30000);
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      mem.set(url, d);
      if (lsKey) { try { localStorage.setItem(lsKey, JSON.stringify({ t: Date.now(), d })); } catch (e) { /* cheio */ } }
      return d;
    } finally { clearTimeout(to); }
  }
  const dataUrl = name => DATA + name + '?v=' + Math.floor(Date.now() / 3.6e6);

  // ---------- estado da tela ----------
  const saved = (() => { try { return JSON.parse(localStorage.getItem('ipFiltro') || 'null'); } catch (e) { return null; } })() || {};
  const st = {
    uf: saved.uf || '', mun: saved.mun || '', bairro: '', cargo: 'todos', mand: saved.mand || 'atual', q: '',
    loading: '', err: '', geo: null, cityGeo: null, ibgeMun: [], est: null, munData: null, bairros: null, camara: null, senado: null,
    govs: null, index: null,
  };
  let root = null, seq = 0;
  const people = {}; // id -> pessoa (para abrir o card)
  function salvar() { try { localStorage.setItem('ipFiltro', JSON.stringify({ uf: st.uf, mun: st.mun, mand: st.mand })); } catch (e) { /* ok */ } }

  // ---------- pessoas ----------
  function fotoTSE(ano, sq, ue, uf) {
    const ele = { 2022: '2040602022', 2024: '2045202024', 2026: '20322002026' }[ano];
    const l = [];
    if (ano === 2024 && uf) l.push(`https://resultados.tse.jus.br/oficial/ele2024/619/fotos/${uf.toLowerCase()}/${sq}.jpeg`);
    if (ele) l.push(`${DIVULGA}/rest/arquivo/img/${ele}/${sq}/${ue}`);
    return l;
  }
  function fromTSE(x, cargo, uf, extra) {
    const id = 'tse-' + x.sq;
    const p = people[id] || {};
    Object.assign(p, {
      id, nome: x.n, nomeCompleto: x.nc, partido: x.p, cargo, uf, numero: x.nr, votos: x.v, qp: x.s, ano: x.a,
      tse: { sq: x.sq, ue: x.ue, ano: x.a }, ocupacao: x.oc, instrucao: x.gi, base: x.b || [],
      fotos: (p.fotos && p.fotos.length ? p.fotos : []).concat(fotoTSE(x.a, x.sq, x.ue, uf)),
    }, extra || {});
    p.fotos = [...new Set(p.fotos)];
    people[id] = p;
    return p;
  }

  // ---------- carregamento ----------
  async function ensureIndex() {
    if (!st.govs) { try { st.govs = await getJSON(dataUrl('governadores.json')); } catch (e) { st.govs = {}; } }
    if (!st.index) { try { st.index = await getJSON(dataUrl('index.json')); } catch (e) { st.index = { bairroUfs: [] }; } }
    if (!st.senado) {
      try {
        const j = await getJSON(SENADO + '/senador/lista/atual.json', { cache: 12 * 3600e3 });
        st.senado = (j.ListaParlamentarEmExercicio.Parlamentares.Parlamentar || []).map(s => s.IdentificacaoParlamentar);
      } catch (e) { st.senado = []; }
    }
  }
  async function loadUf() {
    const uf = st.uf;
    const my = ++seq;
    st.loading = 'Carregando ' + UFS[uf][0] + '…'; paint();
    const [geo, lista, est, munData, cam] = await Promise.all([
      getJSON(`${IBGE}/v3/malhas/estados/${uf}?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio`, { cache: 30 * 864e5 }).catch(() => null),
      getJSON(`${IBGE}/v1/localidades/estados/${uf}/municipios`, { cache: 30 * 864e5 }).catch(() => []),
      getJSON(dataUrl(uf.toLowerCase() + '.json')).catch(() => null),
      getJSON(dataUrl(uf.toLowerCase() + '-mun.json')).catch(() => null),
      getJSON(`${CAMARA}/deputados?siglaUf=${uf}&itens=100&ordem=ASC&ordenarPor=nome`, { cache: 12 * 3600e3 }).then(j => j.dados).catch(() => []),
    ]);
    if (my !== seq) return false;
    st.geo = geo; st.ibgeMun = lista || []; st.est = est; st.munData = munData; st.camara = cam;
    linkMunicipios();
    st.loading = '';
    return true;
  }
  async function loadCity() {
    const my = ++seq;
    const m = cityInfo();
    st.cityGeo = null; st.bairros = null;
    if (!m) return;
    st.loading = 'Carregando ' + m.nome + '…'; paint();
    const temBairro = st.index && (st.index.bairroUfs || []).includes(st.uf);
    const [g, b] = await Promise.all([
      m.ibge ? getJSON(`${IBGE}/v3/malhas/municipios/${m.ibge}?formato=application/vnd.geo+json&qualidade=maxima`, { cache: 30 * 864e5 }).catch(() => null) : null,
      temBairro && m.tse ? getJSON(dataUrl(`bairros/${st.uf.toLowerCase()}/${m.tse}.json`)).catch(() => null) : null,
    ]);
    if (my !== seq) return;
    st.cityGeo = g; st.bairros = b && b.bairros ? b.bairros.filter(x => x.nm) : null;
    st.loading = '';
  }

  // liga código do TSE (usado nos dados eleitorais) ao código do IBGE (usado nos mapas)
  let tse2ibge = {}, ibge2tse = {}, ibgeNome = {};
  function linkMunicipios() {
    tse2ibge = {}; ibge2tse = {}; ibgeNome = {};
    const porNome = {}, porCompacto = {};
    st.ibgeMun.forEach(m => { ibgeNome[m.id] = m.nome; porNome[fold(m.nome)] = String(m.id); porCompacto[compact(m.nome)] = String(m.id); });
    const tseNomes = Object.assign({}, (st.est && st.est.mun) || {});
    Object.entries((st.munData && st.munData.mun) || {}).forEach(([c, m]) => { tseNomes[c] = m.nm; });
    Object.entries(tseNomes).forEach(([c, nm]) => {
      let id = porNome[fold(nm)] || porCompacto[compact(nm)];
      if (!id) {
        const alvo = compact(nm);
        let best = null, bd = 3;
        Object.keys(porCompacto).forEach(k => { const d = lev(alvo, k, bd); if (d < bd) { bd = d; best = k; } });
        if (best) id = porCompacto[best];
      }
      if (id) { tse2ibge[c] = id; ibge2tse[id] = c; }
    });
  }
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) >= max) return max;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let mn = i;
      for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); mn = Math.min(mn, cur[j]); }
      if (mn >= max) return max;
      prev = cur;
    }
    return prev[b.length];
  }
  function cityInfo() {
    if (!st.mun) return null;
    const ibge = st.mun, tse = ibge2tse[ibge];
    return { ibge, tse, nome: ibgeNome[ibge] || (st.munData && st.munData.mun[tse] || {}).nm || '' };
  }

  // ---------- quem aparece em cada nível ----------
  function deputadosFederaisAtuais() {
    const tse = (st.est && st.est.m22 && st.est.m22['6']) || [];
    const porNome = {};
    tse.forEach(x => { porNome[fold(x.n)] = x; porNome[fold(x.nc)] = x; });
    return (st.camara || []).map(d => {
      const x = porNome[fold(d.nome)];
      const base = { camaraId: d.id, fotos: [https(d.urlFoto)], partido: d.siglaPartido, nome: d.nome };
      if (x) return fromTSE(x, 'depf', st.uf, base);
      const id = 'cam-' + d.id;
      people[id] = Object.assign(people[id] || {}, { id, cargo: 'depf', uf: st.uf, base: [] }, base);
      return people[id];
    });
  }
  function senadoresAtuais(uf) {
    const tse = (st.est && st.est.uf === uf && st.est.m22 && st.est.m22['5']) || [];
    return (st.senado || []).filter(s => s.UfParlamentar === uf).map(s => {
      const x = tse.find(t => fold(t.n) === fold(s.NomeParlamentar) || fold(t.nc) === fold(s.NomeCompletoParlamentar));
      const base = { senadoCod: s.CodigoParlamentar, fotos: [https(s.UrlFotoParlamentar)], partido: s.SiglaPartidoParlamentar, nome: s.NomeParlamentar, nomeCompleto: s.NomeCompletoParlamentar, pagina: https(s.UrlPaginaParlamentar) };
      if (x) return fromTSE(x, 'sen', uf, base);
      const id = 'sen-' + s.CodigoParlamentar;
      people[id] = Object.assign(people[id] || {}, { id, cargo: 'sen', uf, base: [] }, base);
      return people[id];
    });
  }
  function governador(uf) {
    const g = st.govs && st.govs[uf];
    const x = g && (st.mand === 'e26' ? g.e26 : g.m22);
    return x ? fromTSE(x, 'gov', uf, st.mand === 'e26' ? { posse2027: true } : {}) : null;
  }
  const tseGrupo = (g, c) => ((st.est && st.est[g] && st.est[g][c]) || []);

  // lista de { p, at: código IBGE da cidade-âncora | 'uf:XX' | 'bairro:i', info }
  function pessoasDoNivel() {
    const out = [];
    const want = k => st.cargo === 'todos' || st.cargo === k;
    if (!st.uf) {
      Object.keys(UFS).forEach(uf => {
        if (want('gov') || st.cargo === 'todos') { const g = governador(uf); if (g) out.push({ p: g, at: 'uf:' + uf }); }
        if (st.cargo === 'sen') senadoresAtuais(uf).forEach(p => out.push({ p, at: 'uf:' + uf }));
      });
      return out;
    }
    const capital = UFS[st.uf][1];
    const baseCidade = p => { const b = (p.base || [])[0]; return (b && tse2ibge[b[0]]) || capital; };
    const e26 = st.mand === 'e26';
    if (!st.mun) {
      if (want('gov')) { const g = governador(st.uf); if (g) out.push({ p: g, at: capital }); }
      if (want('sen')) {
        const sens = e26 ? tseGrupo('e26', '5').map(x => fromTSE(x, 'sen', st.uf, { posse2027: true })) : senadoresAtuais(st.uf);
        sens.forEach(p => out.push({ p, at: capital }));
      }
      if (want('depf')) {
        const deps = e26 ? tseGrupo('e26', '6').map(x => fromTSE(x, 'depf', st.uf, { posse2027: true })) : deputadosFederaisAtuais();
        deps.forEach(p => out.push({ p, at: baseCidade(p) }));
      }
      if (want('depe')) {
        const c = st.uf === 'DF' ? '8' : '7';
        tseGrupo(e26 ? 'e26' : 'm22', c).forEach(x => { const p = fromTSE(x, st.uf === 'DF' ? 'depd' : 'depe', st.uf, e26 ? { posse2027: true } : {}); out.push({ p, at: baseCidade(p) }); });
      }
      if (st.cargo === 'pref') {
        Object.entries((st.munData && st.munData.mun) || {}).forEach(([c, m]) => {
          const x = m['11'] && m['11'][0];
          if (x && tse2ibge[c]) out.push({ p: fromTSE(x, 'pref', st.uf, { local: m.nm }), at: tse2ibge[c] });
        });
      }
      return out;
    }
    // cidade
    const ci = cityInfo();
    const md = ci && ci.tse && st.munData && st.munData.mun[ci.tse];
    const pref = md && md['11'] ? md['11'].map(x => fromTSE(x, 'pref', st.uf, { local: md.nm })) : [];
    const vers = md && md['13'] ? md['13'].map(x => fromTSE(x, 'ver', st.uf, { local: md.nm })) : [];
    const topBairro = {};
    if (st.bairros) {
      st.bairros.forEach((b, i) => (b.v13 || []).forEach(([nr, v, pc, sq]) => { if (sq && (!topBairro[sq] || v > topBairro[sq].v)) topBairro[sq] = { i, v, pc }; }));
    }
    if (st.bairro !== '') {
      const i = +st.bairro, b = st.bairros && st.bairros[i];
      if (!b) return out;
      if (want('pref')) pref.forEach(p => { const r = (b.v11 || []).find(t => t[3] === p.tse.sq); out.push({ p, at: 'bairro:' + i, info: r ? `${pct(r[2])} dos votos para prefeito no bairro` : '' }); });
      if (want('ver')) {
        (b.v13 || []).filter(t => t[3]).forEach(t => {
          const p = vers.find(v => v.tse.sq === t[3]);
          if (p) out.push({ p, at: 'bairro:' + i, info: `${intl(t[1])} votos aqui (${pct(t[2])} do bairro)`, ord: -t[1] });
        });
      }
      return out.sort((a, b2) => (a.p.cargo === 'pref' ? -1e9 : a.ord || 0) - (b2.p.cargo === 'pref' ? -1e9 : b2.ord || 0));
    }
    if (want('pref')) pref.forEach(p => out.push({ p, at: ci.ibge }));
    if (want('ver')) vers.forEach(p => { const t = topBairro[p.tse.sq]; out.push({ p, at: t ? 'bairro:' + t.i : ci.ibge, info: t ? `mais votado(a) em ${st.bairros[t.i].nm}` : '' }); });
    if (st.cargo === 'todos' || st.cargo === 'depf' || st.cargo === 'depe') {
      const aqui = ci.tse;
      const deps = [];
      if (want('depf')) deps.push(...deputadosFederaisAtuais().filter(p => (p.base || []).some(b => b[0] === aqui)));
      if (want('depe')) tseGrupo('m22', st.uf === 'DF' ? '8' : '7').filter(x => (x.b || []).some(b => b[0] === aqui)).forEach(x => deps.push(fromTSE(x, st.uf === 'DF' ? 'depd' : 'depe', st.uf)));
      deps.forEach(p => { const b = p.base.find(t => t[0] === aqui); out.push({ p, at: ci.ibge, info: b ? `${intl(b[1])} votos nesta cidade em 2022 (${pct(b[2])} dos votos dele(a))` : '', dep: true }); });
    }
    return out;
  }

  // ---------- mapa (SVG com zoom e arrasto) ----------
  let map = null; // { svg, base:{x,y,w,h}, view, anchors:{key:[x,y]}, project }
  function projector(bbox) {
    const [minX, minY, maxX, maxY] = bbox;
    const k = Math.cos(((minY + maxY) / 2) * Math.PI / 180);
    const W = 1000, sx = W / ((maxX - minX) * k || 1);
    return { f: (lon, lat) => [(lon - minX) * k * sx, (maxY - lat) * sx], w: W, h: (maxY - minY) * sx };
  }
  function geoBBox(features) {
    let a = [180, 90, -180, -90];
    const walk = c => { if (typeof c[0] === 'number') { a = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[0]), Math.max(a[3], c[1])]; } else c.forEach(walk); };
    features.forEach(f => walk(f.geometry.coordinates));
    return a;
  }
  function pathD(geom, f) {
    const rings = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    let d = '';
    rings.forEach(poly => poly.forEach(ring => { ring.forEach((c, i) => { const [x, y] = f(c[0], c[1]); d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }); d += 'Z'; }));
    return d;
  }
  function centroid(geom, f) {
    // centro do maior anel (área ponderada)
    const rings = geom.type === 'Polygon' ? [geom.coordinates[0]] : geom.coordinates.map(p => p[0]);
    let best = null, bestA = -1;
    rings.forEach(r => {
      let a = 0, cx = 0, cy = 0;
      const pts = r.map(c => f(c[0], c[1]));
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const cr = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
        a += cr; cx += (pts[j][0] + pts[i][0]) * cr; cy += (pts[j][1] + pts[i][1]) * cr;
      }
      if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = a ? [cx / (3 * a), cy / (3 * a)] : pts[0]; }
    });
    return best || [0, 0];
  }

  // ---------- cores do mapa (pelo partido de quem governa cada lugar) ----------
  function corArea(partido, op) { return partido ? `fill:${partyColor(partido)};fill-opacity:${op || 0.78}` : ''; }
  function partidoGov(uf) { const g = st.govs && st.govs[uf]; const x = g && (st.mand === 'e26' ? g.e26 : g.m22); return x ? x.p : ''; }
  function partidoPref(tse) { const m = tse && st.munData && st.munData.mun[tse]; return m && m['11'] && m['11'][0] ? m['11'][0].p : ''; }
  function partidoBairro(b) {
    // partido do vereador eleito mais votado no bairro
    const md = st.munData && st.munData.mun[(cityInfo() || {}).tse];
    const t = (b.v13 || []).find(x => x[3]);
    const v = t && md && (md['13'] || []).find(y => y.sq === t[3]);
    return v ? v.p : '';
  }
  function legenda() {
    const cont = {};
    let titulo_ = '';
    if (!st.uf) { titulo_ = 'Cor do estado = partido do governador' + (st.mand === 'e26' ? ' eleito em 2026' : ''); Object.keys(UFS).forEach(uf => { const p = partidoGov(uf); if (p) cont[p] = (cont[p] || 0) + 1; }); }
    else if (!st.mun) { titulo_ = 'Cor da cidade = partido do prefeito (eleição 2024)'; Object.keys((st.munData && st.munData.mun) || {}).forEach(c => { const p = partidoPref(c); if (p) cont[p] = (cont[p] || 0) + 1; }); }
    else if (st.bairros && st.bairros.length) { titulo_ = 'Cor do bairro = partido do vereador eleito mais votado ali'; st.bairros.forEach(b => { const p = partidoBairro(b); if (p) cont[p] = (cont[p] || 0) + 1; }); }
    const lst = Object.entries(cont).sort((a, b) => b[1] - a[1]);
    if (!lst.length) return '';
    return `<div class="ip-leg"><small>${esc(titulo_)}</small><div>${lst.map(([p, n]) => `<span><i style="background:${partyColor(p)}"></i>${esc(p)} <b>${n}</b></span>`).join('')}</div></div>`;
  }

  function mapHtml() {
    if (!st.uf) {
      const M = window.BR_MAP;
      if (!M) return '<div class="ip-msg">Mapa indisponível.</div>';
      return `<svg class="ip-svg" viewBox="${M.viewBox}" data-kind="br">
        <g class="ip-areas">${M.locations.map(l => `<path d="${l.path}" data-uf="${l.id.toUpperCase()}" style="${corArea(partidoGov(l.id.toUpperCase()))}"></path>`).join('')}</g>
        <g class="ip-labels"></g><g class="ip-marks"></g></svg>`;
    }
    if (!st.mun) {
      if (!st.geo) return '<div class="ip-msg">Não foi possível carregar o mapa do estado (IBGE). Verifique a internet e toque em ↻.</div>';
      const fs = st.geo.features;
      // Fernando de Noronha fica longe do continente: não entra no enquadramento do mapa de PE
      const pj = projector(geoBBox(fs.filter(f => f.properties.codarea !== '2605459') .length ? fs.filter(f => f.properties.codarea !== '2605459') : fs));
      const hMin = Math.max(pj.h + 40, (pj.w + 40) * 0.7);
      map = { project: pj.f, base: { x: -20, y: -20 - (hMin - pj.h - 40) / 2, w: pj.w + 40, h: hMin }, anchors: {}, names: {} };
      const paths = fs.map(ft => {
        const id = ft.properties.codarea;
        map.anchors[id] = centroid(ft.geometry, pj.f);
        return `<path d="${pathD(ft.geometry, pj.f)}" data-mun="${id}" style="${corArea(partidoPref(ibge2tse[id]))}"></path>`;
      }).join('');
      return `<svg class="ip-svg" viewBox="${map.base.x} ${map.base.y} ${map.base.w} ${map.base.h}" data-kind="uf"><g class="ip-areas">${paths}</g><g class="ip-labels"></g><g class="ip-marks"></g></svg>`;
    }
    const g = st.cityGeo;
    const feats = g ? (g.features || [g]) : [];
    const pts = (st.bairros || []).filter(b => b.lat);
    let bb = feats.length ? geoBBox(feats) : null;
    if (bb) { const f0 = bb; for (const b of st.bairros || []) if (b.lat && (b.lon < f0[0] - 0.3 || b.lon > f0[2] + 0.3 || b.lat < f0[1] - 0.3 || b.lat > f0[3] + 0.3)) { delete b.lat; delete b.lon; } }
    if (bb && pts.length) pts.splice(0, pts.length, ...pts.filter(b => b.lat));
    if (bb && pts.length) bb = [Math.min(bb[0], ...pts.map(b => b.lon)), Math.min(bb[1], ...pts.map(b => b.lat)), Math.max(bb[2], ...pts.map(b => b.lon)), Math.max(bb[3], ...pts.map(b => b.lat))];
    if (!bb && pts.length) bb = [Math.min(...pts.map(b => b.lon)), Math.min(...pts.map(b => b.lat)), Math.max(...pts.map(b => b.lon)), Math.max(...pts.map(b => b.lat))];
    if (!bb) return '<div class="ip-msg">Não foi possível carregar o mapa da cidade (IBGE). Toque em ↻ para tentar de novo.</div>';
    const pj = projector(bb);
    map = { project: pj.f, base: { x: -30, y: -30, w: pj.w + 60, h: pj.h + 60 }, anchors: {}, names: {} };
    const ci = cityInfo();
    map.anchors[ci.ibge] = feats.length ? centroid(feats[0].geometry, pj.f) : [pj.w / 2, pj.h / 2];
    const shape = feats.map(ft => `<path d="${pathD(ft.geometry, pj.f)}" class="city" style="${corArea(partidoPref(ci.tse), 0.3)}"></path>`).join('');
    const dots = (st.bairros || []).map((b, i) => {
      if (!b.lat) return '';
      const [x, y] = pj.f(b.lon, b.lat);
      map.anchors['bairro:' + i] = [x, y];
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" data-bairro="${i}" class="${String(i) === st.bairro ? 'sel' : ''}" style="fill:${partidoBairro(b) ? partyColor(partidoBairro(b)) : '#ffdf00'}"></circle>`;
    }).join('');
    return `<svg class="ip-svg" viewBox="${map.base.x} ${map.base.y} ${map.base.w} ${map.base.h}" data-kind="city"><g class="ip-areas">${shape}</g><g class="ip-dots">${dots}</g><g class="ip-labels"></g><g class="ip-marks"></g></svg>`;
  }

  function mountMap() {
    const svg = root.querySelector('.ip-svg');
    if (!svg) return;
    if (svg.dataset.kind === 'br') {
      const vb = window.BR_MAP.viewBox.split(' ').map(Number);
      map = { base: { x: vb[0], y: vb[1], w: vb[2], h: vb[3] }, anchors: {} };
      svg.querySelectorAll('path[data-uf]').forEach(p => { const b = p.getBBox(); map.anchors['uf:' + p.dataset.uf] = [b.x + b.width / 2, b.y + b.height / 2]; });
      const ADJ = { GO: [-14, 18], DF: [6, -2], MG: [6, 8], BA: [-14, 10], RJ: [10, 6], ES: [8, 4], PB: [10, 2], PE: [16, 0], AL: [6, 2], SE: [2, 2], RN: [4, 0] };
      Object.entries(ADJ).forEach(([k, d]) => { const a = map.anchors['uf:' + k]; if (a) map.anchors['uf:' + k] = [a[0] + d[0], a[1] + d[1]]; });
    } else if (svg.dataset.kind === 'uf' && st.uf) {
      map.anchors['uf:' + st.uf] = map.anchors[UFS[st.uf][1]] || [map.base.w / 2, map.base.h / 2];
    }
    map.svg = svg;
    map.view = Object.assign({}, map.base);
    if (svg.dataset.kind === 'city' && st.bairro !== '' && map.anchors['bairro:' + st.bairro]) {
      const [x, y] = map.anchors['bairro:' + st.bairro];
      const w = map.base.w / 3, h = map.base.h / 3;
      map.view = { x: x - w / 2, y: y - h / 2, w, h };
    }
    drawMarks();
    applyView();
    bindPan(svg);
  }

  function unitsPerPx() { const r = map.svg.getBoundingClientRect(); return map.view.w / Math.max(1, r.width); }
  function applyView() {
    const v = map.view;
    map.svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    const u = unitsPerPx();
    const zoom = map.base.w / v.w;
    map.svg.style.setProperty('--u', u);
    map.svg.classList.toggle('zfar', (map.svg.dataset.kind === 'br' || map.svg.querySelectorAll('.ip-mark').length > 12) && zoom < 1.8);
    map.svg.querySelectorAll('.ip-mark').forEach(g => {
      const ax = +g.dataset.ax, ay = +g.dataset.ay, ox = +g.dataset.ox, oy = +g.dataset.oy;
      g.setAttribute('transform', `translate(${ax + ox * u} ${ay + oy * u}) scale(${u})`);
    });
    map.svg.querySelectorAll('.ip-lbl').forEach(t => {
      t.setAttribute('font-size', (+t.dataset.fs) * u);
      t.setAttribute('stroke-width', 3 * u);
      const show = t.dataset.always === '1' || zoom >= (+t.dataset.minz || 0);
      t.style.display = show ? '' : 'none';
    });
    map.svg.querySelectorAll('.ip-dots circle').forEach(c => { const sel = c.classList.contains('sel'); c.setAttribute('r', (sel ? 9 : 5.5) * u); c.style.strokeWidth = (sel ? 3 : 1.2) * u; });
    map.svg.querySelectorAll('.ip-areas path').forEach(p => p.setAttribute('stroke-width', (p.classList.contains('city') ? 2 : 0.8) * u));
  }

  function label(g, x, y, text, fs, minz, always, cls, acima) {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', x); t.setAttribute('y', y);
    if (acima) t.setAttribute('dy', '-2.6em'); // nome do lugar acima das fotos
    t.setAttribute('class', 'ip-lbl' + (cls ? ' ' + cls : ''));
    t.dataset.fs = fs; t.dataset.minz = minz || 0; if (always) t.dataset.always = '1';
    t.textContent = text;
    g.appendChild(t);
  }

  function drawMarks() {
    const svg = map.svg, gl = svg.querySelector('.ip-labels'), gm = svg.querySelector('.ip-marks');
    gl.innerHTML = ''; gm.innerHTML = '';
    const lista = pessoasDoNivel().filter(x => matchQ(x.p));
    const comMarca = new Set(lista.map(x => x.at));
    // nomes dos lugares
    if (svg.dataset.kind === 'br') {
      Object.keys(UFS).forEach(uf => { const a = map.anchors['uf:' + uf]; if (a) label(gl, a[0], a[1] - 2, uf, 12, 0, true, 'uf', comMarca.has('uf:' + uf)); });
    } else if (svg.dataset.kind === 'uf') {
      const areas = st.geo.features.map(f => f.properties.codarea);
      const cap = UFS[st.uf][1];
      areas.forEach(id => {
        const a = map.anchors[id]; if (!a) return;
        const always = id === cap || comMarca.has(id);
        label(gl, a[0], a[1], ibgeNome[id] || '', always ? 11 : 10, areas.length > 60 ? 2.2 : 1.2, always, id === cap ? 'cap' : '', comMarca.has(id));
      });
    } else {
      const ci = cityInfo();
      const a = map.anchors[ci.ibge];
      if (!st.bairros || !st.bairros.length) label(gl, a[0], a[1], ci.nome, 13, 0, true, 'cap', comMarca.has(ci.ibge));
      (st.bairros || []).forEach((b, i) => {
        const p = map.anchors['bairro:' + i]; if (!p) return;
        const always = String(i) === st.bairro || comMarca.has('bairro:' + i);
        label(gl, p[0], p[1], b.nm, always ? 11 : 9.5, (st.bairros.length > 40 ? 2.4 : 1.3), always, String(i) === st.bairro ? 'cap' : 'bai', comMarca.has('bairro:' + i));
      });
    }
    // fotos agrupadas por lugar (em anel quando há várias no mesmo ponto)
    const grupos = {};
    const noMapa = (svg.dataset.kind === 'uf' && st.cargo === 'todos') ? lista.filter(x => !/^dep[ed]$/.test(x.p.cargo)) : lista;
    noMapa.forEach(x => { if (map.anchors[x.at]) (grupos[x.at] = grupos[x.at] || []).push(x); });
    Object.entries(grupos).forEach(([at, xs]) => {
      const [ax, ay] = map.anchors[at];
      xs.forEach((x, i) => {
        const [ox, oy] = ring(i, xs.length);
        gm.appendChild(markEl(x.p, ax, ay, ox, oy));
      });
    });
  }
  // várias pessoas no mesmo lugar: grade centrada logo abaixo do ponto
  function ring(i, n) {
    const cols = n <= 4 ? n : Math.ceil(Math.sqrt(n * 1.6));
    const r = Math.floor(i / cols), c = i % cols;
    const naLinha = Math.min(cols, n - r * cols);
    return [(c - (naLinha - 1) / 2) * 80, r * 58];
  }
  function markEl(p, ax, ay, ox, oy) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'ip-mark');
    Object.assign(g.dataset, { ax, ay, ox, oy, pid: p.id });
    const col = partyColor(p.partido);
    const cid = 'c' + Math.random().toString(36).slice(2, 8);
    const fotos = p.fotos || [];
    g.innerHTML = `<clipPath id="${cid}"><circle r="14"></circle></clipPath>
      <circle r="16" fill="${col}"></circle><circle r="14" fill="#0b2a1b"></circle>
      <text class="ini" y="1">${esc(iniciais(p.nome))}</text>
      ${fotos.length ? `<image href="${esc(fotos[0])}" data-alt="${esc(fotos.slice(1).join('|'))}" x="-14" y="-14" width="28" height="28" preserveAspectRatio="xMidYMin slice" clip-path="url(#${cid})" onerror="window.ipImgErr(this)"></image>` : ''}
      <text class="nm" y="27">${esc(cortar(curto(p.nome), 15))}</text>`;
    return g;
  }
  const cortar = (t, n) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
  const curto = n => {
    const w = String(n || '').split(/\s+/).filter(Boolean);
    if (w.length <= 2) return n;
    const k = w.findIndex((x, i) => i > 0 && !/^(da|de|do|das|dos|e)$/i.test(x));
    return k > 0 ? w.slice(0, k + 1).join(' ') : w.slice(0, 2).join(' ');
  };
  window.ipImgErr = function (img) {
    const alt = (img.getAttribute('data-alt') || '').split('|').filter(Boolean);
    if (alt.length) { img.setAttribute('data-alt', alt.slice(1).join('|')); if (img.tagName.toLowerCase() === 'img') img.src = alt[0]; else img.setAttribute('href', alt[0]); }
    else img.remove();
  };

  function bindPan(svg) {
    const pts = new Map();
    let start = null, moved = false;
    const toMap = (cx, cy) => { const r = svg.getBoundingClientRect(); return [map.view.x + (cx - r.left) / r.width * map.view.w, map.view.y + (cy - r.top) / r.height * map.view.h]; };
    svg.addEventListener('pointerdown', e => {
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      moved = false;
      start = { view: Object.assign({}, map.view), pts: new Map(pts) };
    });
    svg.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId) || !start) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      const r = svg.getBoundingClientRect();
      if (pts.size === 1) {
        const [sx, sy] = start.pts.get(e.pointerId) || [e.clientX, e.clientY];
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
        if (!moved || zoomLevel() <= 1.01) return;
        map.view.x = start.view.x - dx / r.width * start.view.w;
        map.view.y = start.view.y - dy / r.height * start.view.h;
        clampView(); applyView();
      } else if (pts.size === 2) {
        moved = true;
        const a = [...start.pts.values()], b = [...pts.values()];
        if (a.length < 2) return;
        const d0 = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]), d1 = Math.hypot(b[0][0] - b[1][0], b[0][1] - b[1][1]);
        const s = d0 / Math.max(1, d1);
        const cx = (a[0][0] + a[1][0]) / 2, cy = (a[0][1] + a[1][1]) / 2;
        const mx = start.view.x + (cx - r.left) / r.width * start.view.w, my = start.view.y + (cy - r.top) / r.height * start.view.h;
        const w = Math.min(map.base.w, Math.max(map.base.w / 40, start.view.w * s)), h = w * start.view.h / start.view.w;
        map.view = { x: mx - (mx - start.view.x) * w / start.view.w, y: my - (my - start.view.y) * h / start.view.h, w, h };
        clampView(); applyView();
      }
    });
    const end = e => { pts.delete(e.pointerId); if (pts.size === 0) setTimeout(() => { start = null; }, 0); else start = { view: Object.assign({}, map.view), pts: new Map(pts) }; };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('click', e => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
    svg.addEventListener('wheel', e => { e.preventDefault(); const [mx, my] = toMap(e.clientX, e.clientY); zoomAt(e.deltaY < 0 ? 1.4 : 1 / 1.4, mx, my); }, { passive: false });
    svg.addEventListener('dblclick', e => { const [mx, my] = toMap(e.clientX, e.clientY); zoomAt(2, mx, my); });
  }
  const zoomLevel = () => map.base.w / map.view.w;
  function zoomAt(f, mx, my) {
    const v = map.view;
    const w = Math.min(map.base.w, Math.max(map.base.w / 40, v.w / f)), h = w * v.h / v.w;
    if (mx == null) { mx = v.x + v.w / 2; my = v.y + v.h / 2; }
    map.view = { x: mx - (mx - v.x) * w / v.w, y: my - (my - v.y) * h / v.h, w, h };
    clampView(); applyView();
  }
  function clampView() {
    const b = map.base, v = map.view;
    if (v.w >= b.w) { v.w = b.w; v.h = b.h; v.x = b.x; v.y = b.y; return; }
    v.x = Math.max(b.x, Math.min(b.x + b.w - v.w, v.x));
    v.y = Math.max(b.y, Math.min(b.y + b.h - v.h, v.y));
  }

  // ---------- tela principal ----------
  function matchQ(p) { if (!st.q) return true; const q = fold(st.q); return fold(p.nome).includes(q) || fold(p.nomeCompleto).includes(q) || fold(p.partido) === q; }
  function chipsDoNivel() {
    if (!st.uf) return ['todos', 'gov', 'sen'];
    if (!st.mun) return ['todos', 'gov', 'sen', 'depf', 'depe', 'pref'];
    if (st.bairro !== '') return ['todos', 'pref', 'ver'];
    return ['todos', 'pref', 'ver', 'depf', 'depe'];
  }
  function titulo() {
    if (!st.uf) return 'Brasil — governadores' + (st.cargo === 'sen' ? ' e senadores' : '');
    if (!st.mun) return UFS[st.uf][0];
    const ci = cityInfo();
    if (st.bairro !== '' && st.bairros) return `${st.bairros[+st.bairro].nm} — ${ci.nome}`;
    return `${ci.nome} (${st.uf})`;
  }
  function cardPessoa(x) {
    const p = x.p;
    const col = partyColor(p.partido);
    const fotos = p.fotos || [];
    return `<button class="ip-card" data-act="ip-pessoa" data-pid="${esc(p.id)}" style="--pc:${col}">
      <span class="ip-ph"><span>${esc(iniciais(p.nome))}</span>${fotos.length ? `<img src="${esc(fotos[0])}" data-alt="${esc(fotos.slice(1).join('|'))}" alt="" loading="lazy" onerror="window.ipImgErr(this)">` : ''}</span>
      <span class="ip-ct"><b>${esc(p.nome)}</b><small>${esc(CARGOS[p.cargo] || '')} · ${esc(p.partido || '')}${p.posse2027 ? ' · posse em 2027' : ''}</small>
      ${x.info ? `<em>${esc(x.info)}</em>` : (p.votos ? `<em>${intl(p.votos)} votos em ${p.ano}</em>` : '')}</span><b class="ip-go">›</b></button>`;
  }
  function selects() {
    const ufOpts = Object.entries(UFS).sort((a, b) => a[1][0].localeCompare(b[1][0])).map(([k, v]) => `<option value="${k}" ${st.uf === k ? 'selected' : ''}>${esc(v[0])}</option>`).join('');
    const cidades = st.uf ? st.ibgeMun.slice().sort((a, b) => a.nome.localeCompare(b.nome)).map(m => `<option value="${m.id}" ${String(m.id) === st.mun ? 'selected' : ''}>${esc(m.nome)}</option>`).join('') : '';
    const temBairros = st.mun && st.bairros && st.bairros.length;
    const bairros = temBairros ? st.bairros.map((b, i) => [b, i]).sort((a, b) => a[0].nm.localeCompare(b[0].nm)).map(([b, i]) => `<option value="${i}" ${String(i) === st.bairro ? 'selected' : ''}>${esc(b.nm)}</option>`).join('') : '';
    const semBairroMsg = st.mun && !temBairros ? (st.index && (st.index.bairroUfs || []).includes(st.uf) ? 'Sem bairros para esta cidade' : 'Bairros: disponível em ' + ((st.index && st.index.bairroUfs || []).join(', ') || 'breve')) : 'Escolha a cidade';
    return `<div class="ip-filters">
      <label><span>Estado</span><select class="input" data-ip="uf"><option value="">Brasil (todos)</option>${ufOpts}</select></label>
      <label><span>Cidade</span><select class="input" data-ip="mun" ${st.uf ? '' : 'disabled'}><option value="">${st.uf ? 'Todas as cidades' : 'Escolha o estado'}</option>${cidades}</select></label>
      <label><span>Bairro</span><select class="input" data-ip="bairro" ${temBairros ? '' : 'disabled'}><option value="">${temBairros ? 'Todos os bairros' : esc(semBairroMsg)}</option>${bairros}</select></label>
    </div>`;
  }
  function paint() {
    if (!root) return;
    const lista = st.loading ? [] : pessoasDoNivel().filter(x => matchQ(x.p));
    const chips = chipsDoNivel();
    if (!chips.includes(st.cargo)) st.cargo = 'todos';
    const showMand = st.uf && !st.mun && ['todos', 'gov', 'sen', 'depf', 'depe'].includes(st.cargo) || (!st.uf);
    const crumbs = [`<button data-act="ip-nivel" data-n="br">Brasil</button>`];
    if (st.uf) crumbs.push(`<button data-act="ip-nivel" data-n="uf">${esc(st.uf)}</button>`);
    if (st.mun) crumbs.push(`<button data-act="ip-nivel" data-n="mun">${esc((cityInfo() || {}).nome || '')}</button>`);
    if (st.bairro !== '' && st.bairros) crumbs.push(`<span>${esc(st.bairros[+st.bairro].nm)}</span>`);
    const grupos = {};
    lista.forEach(x => { const k = x.dep ? 'dep' : x.p.cargo; (grupos[k] = grupos[k] || []).push(x); });
    const ORD = [['gov', 'Governador(a)'], ['sen', 'Senadores'], ['pref', 'Prefeito(a)'], ['ver', 'Vereadores'], ['depf', 'Deputados federais'], ['depe', 'Deputados estaduais'], ['depd', 'Deputados distritais'], ['dep', 'Deputados mais votados nesta cidade (2022)']];
    root.querySelector('.ip-body').innerHTML = `
      ${selects()}
      <div class="ip-chips">${chips.map(k => `<button class="chip ${st.cargo === k ? 'on' : ''}" data-act="ip-cargo" data-k="${k}">${esc(CHIPS.find(c => c[0] === k)[1])}</button>`).join('')}</div>
      ${showMand ? `<div class="ip-chips mand"><button class="chip ${st.mand === 'atual' ? 'on' : ''}" data-act="ip-mand" data-k="atual">Mandato atual</button><button class="chip ${st.mand === 'e26' ? 'on' : ''}" data-act="ip-mand" data-k="e26">Eleitos em 2026 (posse 2027)</button></div>` : ''}
      <input class="input ip-q" type="search" placeholder="Buscar político ou partido…" value="${esc(st.q)}" data-ip="q">
      <nav class="ip-crumbs">${crumbs.join('<i>›</i>')}</nav>
      <div class="ip-mapbox">${st.loading ? `<div class="ip-msg"><span class="spin"></span> ${esc(st.loading)}</div>` : mapHtml()}
        ${st.loading ? '' : `<div class="ip-zoom"><button data-act="ip-zoom" data-z="in">+</button><button data-act="ip-zoom" data-z="out">−</button><button data-act="ip-zoom" data-z="reset">⤢</button></div>`}
      </div>
      ${st.loading ? '' : legenda()}
      <p class="ip-hint">${!st.uf ? 'Toque em um estado para ver os políticos de lá. Toque numa foto para ver a carreira.' : !st.mun ? 'Toque em uma cidade para ver prefeito e vereadores. Os deputados aparecem na cidade onde tiveram mais votos' + (st.cargo === 'todos' ? ' (para ver os deputados estaduais no mapa, toque em “Dep. estaduais”)' : '') + '. Use dois dedos ou os botões para dar zoom — os nomes aparecem ao aproximar.' : st.bairros && st.bairros.length ? 'Os pontos são os bairros (pelos locais de votação). Cada vereador aparece no bairro onde teve mais votos. Toque num bairro para filtrar.' : 'Toque numa foto para ver a carreira.'}</p>
      <h3 class="ip-h">${esc(titulo())} <small>${lista.length} político(s)</small></h3>
      ${ORD.filter(([k]) => grupos[k]).map(([k, nm]) => `<h4 class="ip-g">${esc(nm)}</h4><div class="ip-list">${grupos[k].map(cardPessoa).join('')}</div>`).join('') || (st.loading ? '' : `<div class="ip-msg">${st.est || !st.uf ? 'Nenhum político encontrado com esse filtro.' : 'Os dados deste estado ainda estão sendo preparados no servidor. Tente de novo em alguns minutos.'}</div>`)}
      <p class="ip-src">Fontes oficiais: TSE (candidatos eleitos, votos e locais de votação), Câmara dos Deputados, Senado Federal, IBGE (mapas).</p>`;
    if (!st.loading) mountMap();
  }

  async function setUf(uf) {
    st.uf = uf; st.mun = ''; st.bairro = ''; st.cargo = 'todos'; st.geo = null; st.est = null; st.munData = null;
    salvar();
    if (uf) { await loadUf(); }
    paint();
  }
  async function setMun(mun) {
    st.mun = mun; st.bairro = ''; st.cargo = 'todos';
    salvar();
    if (mun) await loadCity();
    st.loading = '';
    paint();
  }

  async function mount(container, header) {
    container.innerHTML = header + '<main class="ip"><div class="ip-body"></div></main>';
    root = container;
    root.onclick = onClick;
    root.onchange = onChange;
    root.oninput = onInput;
    st.loading = 'Carregando…';
    paint();
    await ensureIndex();
    if (st.uf) { const ok = await loadUf(); if (ok && st.mun) await loadCity(); }
    st.loading = '';
    paint();
  }
  function unmount() { if (root) { root.onclick = null; root.onchange = null; root.oninput = null; } root = null; }

  function onClick(e) {
    const el = e.target.closest('[data-act], [data-uf], [data-mun], [data-bairro], .ip-mark');
    if (!el || !root) return;
    if (el.classList.contains('ip-mark')) { abrir(el.dataset.pid); return; }
    if (el.dataset.uf && !el.dataset.act) { setUf(el.dataset.uf); return; }
    if (el.dataset.mun && !el.dataset.act) { setMun(el.dataset.mun); return; }
    if (el.dataset.bairro != null && !el.dataset.act) { st.bairro = st.bairro === el.dataset.bairro ? '' : el.dataset.bairro; st.cargo = 'todos'; paint(); return; }
  }
  function onChange(e) {
    const k = e.target.dataset.ip;
    if (k === 'uf') setUf(e.target.value);
    else if (k === 'mun') setMun(e.target.value);
    else if (k === 'bairro') { st.bairro = e.target.value; st.cargo = 'todos'; paint(); }
  }
  let qTimer = null;
  function onInput(e) {
    if (e.target.dataset.ip !== 'q') return;
    st.q = e.target.value;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      const pos = e.target.selectionStart;
      paint();
      const inp = root && root.querySelector('.ip-q');
      if (inp) { inp.focus(); try { inp.setSelectionRange(pos, pos); } catch (er) { /* ok */ } }
    }, 250);
  }

  function onAct(act, el) {
    if (act === 'ip-pessoa') { abrir(el.dataset.pid); return true; }
    if (act === 'ip-cargo') { st.cargo = el.dataset.k; paint(); return true; }
    if (act === 'ip-mand') { st.mand = el.dataset.k; salvar(); paint(); return true; }
    if (act === 'ip-zoom') { if (!map || !map.svg) return true; if (el.dataset.z === 'reset') { map.view = Object.assign({}, map.base); applyView(); } else zoomAt(el.dataset.z === 'in' ? 1.6 : 1 / 1.6); return true; }
    if (act === 'ip-nivel') {
      const n = el.dataset.n;
      if (n === 'br') setUf('');
      else if (n === 'uf') { st.mun = ''; st.bairro = ''; st.cargo = 'todos'; salvar(); paint(); }
      else if (n === 'mun') { st.bairro = ''; paint(); }
      return true;
    }
    if (act === 'ip-mais') { const box = document.getElementById(el.dataset.box); if (box) box.classList.toggle('all'); el.remove(); return true; }
    return false;
  }
  function abrir(pid) { if (people[pid]) A().go({ name: 'politico', pid }); }

  // =====================================================================
  // ---------- card do político: carreira e o que fez ----------
  // =====================================================================
  function secao(id, titulo_, corpo) { return `<section class="pf-sec" id="${id}"><h3>${titulo_}</h3><div class="pf-body">${corpo || '<div class="pf-load"><span class="spin"></span> carregando…</div>'}</div></section>`; }
  function setSec(id, html) { const s = document.getElementById(id); if (!s) return; if (html == null) s.remove(); else s.querySelector('.pf-body').innerHTML = html; }

  function renderPerfil(container, header, pid) {
    const p = people[pid];
    if (!p) { container.innerHTML = header + '<main class="detail"><div class="warn">Volte e toque no político de novo.</div></main>'; return; }
    const col = partyColor(p.partido);
    const fotos = p.fotos || [];
    const local = p.local || (p.uf ? UFS[p.uf][0] : '');
    const baseTxt = (p.base || []).length && st.est ? p.base.map(b => `${esc((st.est.mun || {})[b[0]] || b[0])} (${pct(b[2])})`).join(', ') : '';
    container.innerHTML = header + `
      <main class="detail pf" style="--pc:${col}">
        <div class="pf-hero">
          <span class="pf-ph"><span>${esc(iniciais(p.nome))}</span>${fotos.length ? `<img src="${esc(fotos[0])}" data-alt="${esc(fotos.slice(1).join('|'))}" alt="" onerror="window.ipImgErr(this)">` : ''}</span>
          <div><h2>${esc(p.nome)}</h2><p>${esc(CARGOS[p.cargo] || '')}${local ? ' · ' + esc(local) : ''}</p><span class="pf-party">${esc(p.partido || '')}</span>${p.posse2027 ? '<span class="pf-tag">Eleito(a) em 2026 · posse em 2027</span>' : ''}</div>
        </div>
        <div class="pf-facts">
          ${p.votos ? `<div><b>${intl(p.votos)}</b><small>votos na eleição de ${p.ano}${p.qp ? ' (eleito por ' + esc(p.qp) + ')' : ''}</small></div>` : ''}
          ${p.numero ? `<div><b>${esc(p.numero)}</b><small>número na urna</small></div>` : ''}
          ${p.ocupacao ? `<div><b>${esc(p.ocupacao)}</b><small>ocupação declarada</small></div>` : ''}
          ${p.instrucao ? `<div><b>${esc(p.instrucao)}</b><small>escolaridade</small></div>` : ''}
        </div>
        ${baseTxt ? `<p class="pf-base">📍 <b>Onde teve mais votos:</b> ${baseTxt}</p>` : ''}
        ${p.camaraId ? secao('pf-cam', '🏛️ Atuação na Câmara dos Deputados') : ''}
        ${p.senadoCod ? secao('pf-sen', '🏛️ Atuação no Senado') : ''}
        ${p.cargo === 'ver' ? secao('pf-sapl', '🏢 Atuação na Câmara Municipal') : ''}
        ${secao('pf-car', '🗳️ Carreira política (eleições disputadas)')}
        ${secao('pf-wiki', '📖 Biografia')}
        <h3>Mais informações</h3>
        <div class="links" id="pf-links">
          ${p.tse ? `<button class="link-row" data-act="open" data-url="${esc(divulgaLink(p))}" data-title="${esc(p.nome)} no TSE"><span>Ficha completa no TSE (DivulgaCand)</span><small>bens declarados, contas de campanha e documentos</small><b>↗</b></button>` : ''}
          ${p.camaraId ? `<button class="link-row" data-act="open" data-url="https://www.camara.leg.br/deputados/${p.camaraId}" data-title="${esc(p.nome)}"><span>Página na Câmara dos Deputados</span><small>votações, presença e gastos do mandato</small><b>↗</b></button>` : ''}
          ${p.senadoCod ? `<button class="link-row" data-act="open" data-url="https://www25.senado.leg.br/web/senadores/senador/-/perfil/${p.senadoCod}" data-title="${esc(p.nome)}"><span>Página no Senado</span><small>votações, discursos e projetos</small><b>↗</b></button>` : ''}
          <button class="link-row" data-act="open" data-url="https://news.google.com/search?q=${encodeURIComponent('"' + p.nome + '" ' + (CARGOS[p.cargo] || '').replace(/\(a\)/, ''))}&hl=pt-BR&gl=BR&ceid=BR:pt-419" data-title="Notícias"><span>Notícias recentes</span><small>Google Notícias</small><b>↗</b></button>
        </div>
        <p class="lei-aviso">Dados oficiais do TSE, da Câmara dos Deputados, do Senado e das câmaras municipais; biografia da Wikipédia quando existir. Os números são lidos na hora, direto das fontes.</p>
      </main>`;
    carregarPerfil(p);
  }
  function divulgaLink(p) {
    const ele = { 2022: '2040602022', 2024: '2045202024', 2026: '20322002026' }[p.tse.ano];
    return `${DIVULGA}/#/candidato/${p.tse.ano}/${ele}/${p.tse.ue}/${p.tse.sq}`;
  }

  async function carregarPerfil(p) {
    const tarefas = [carreira(p), wiki(p)];
    if (p.camaraId) tarefas.push(camara(p));
    if (p.senadoCod) tarefas.push(senado(p));
    if (p.cargo === 'ver') tarefas.push(sapl(p));
    await Promise.all(tarefas.map(t => t.catch(() => null)));
  }

  const SIT_OK = /^eleit/i;
  async function carreira(p) {
    let lista = [];
    if (p.tse) {
      try {
        const ele = { 2022: '2040602022', 2024: '2045202024', 2026: '20322002026' }[p.tse.ano];
        const j = await getJSON(`${DIVULGA}/rest/v1/candidatura/buscar/${p.tse.ano}/${p.tse.ue}/${ele}/candidato/${p.tse.sq}`, { cache: 7 * 864e5, timeout: 25000 });
        lista = (j.eleicoesAnteriores || []).map(e => ({ ano: e.nrAno, cargo: e.cargo, local: titleCase(e.local), partido: e.partido, sit: e.situacaoTotalizacao || '', link: e.txLink }));
        if (!lista.some(e => +e.ano === +p.tse.ano)) lista.unshift({ ano: p.tse.ano, cargo: (j.cargo && j.cargo.nome) || CARGOS[p.cargo], local: titleCase(j.localCandidatura || ''), partido: (j.partido && j.partido.sigla) || p.partido, sit: j.descricaoTotalizacao || 'Eleito' });
        if (j.ocupacao && !p.ocupacao) p.ocupacao = j.ocupacao;
      } catch (e) { /* segue com o que houver */ }
    }
    if (!lista.length && p.camaraId) {
      try {
        const m = await getJSON(`${CAMARA}/deputados/${p.camaraId}/mandatosExternos`, { cache: 7 * 864e5 });
        lista = (m.dados || []).map(x => ({ ano: x.anoInicio, cargo: x.cargo, local: x.municipio || x.siglaUf, partido: x.siglaPartidoEleicao, sit: `mandato ${x.anoInicio}–${x.anoFim}` }));
      } catch (e) { /* nada */ }
    }
    if (!lista.length) {
      setSec('pf-car', p.tse ? '<p class="muted">O TSE não respondeu agora. Toque em “Ficha completa no TSE” abaixo ou tente de novo mais tarde.</p>'
        : p.senadoCod ? '<p class="muted">Não há candidatura recente deste(a) senador(a) no TSE para listar aqui (por exemplo, quando assumiu como suplente). Os mandatos estão em “Atuação no Senado”.</p>' : null);
      return;
    }
    lista.sort((a, b) => b.ano - a.ano);
    const vit = lista.filter(e => SIT_OK.test(e.sit)).length;
    setSec('pf-car', `<p class="pf-sum">Disputou <b>${lista.length}</b> eleição(ões) e foi eleito(a) <b>${vit}</b> vez(es).</p>
      <ol class="pf-tl">${lista.map(e => `<li class="${SIT_OK.test(e.sit) ? 'win' : ''}"><span class="y">${esc(e.ano)}</span><div><b>${esc(e.cargo)}</b> · ${esc(e.local || '')} <small>${esc(e.partido || '')}</small><br><span class="sit">${esc(e.sit)}</span></div></li>`).join('')}</ol>`);
  }
  function titleCase(s) { return String(s || '').toLowerCase().replace(/(^|[\s(])(\S)/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos|E)\b/g, w => w.toLowerCase()); }

  async function contarCamara(q) {
    const j = await getJSON(`${CAMARA}/proposicoes?${q}&itens=1`, { cache: 864e5 });
    const last = (j.links || []).find(l => l.rel === 'last');
    if (last) { const m = /pagina=(\d+)/.exec(last.href); if (m) return +m[1]; }
    return (j.dados || []).length;
  }
  async function camara(p) {
    const id = p.camaraId;
    const base = `idDeputadoAutor=${id}`;
    const tipos = [['PL', 'Projetos de lei'], ['PEC', 'Propostas de emenda à Constituição'], ['PLP', 'Projetos de lei complementar'], ['PDL', 'Projetos de decreto legislativo'], ['REQ', 'Requerimentos'], ['INC', 'Indicações']];
    const [total, ...porTipo] = await Promise.all([contarCamara(base).catch(() => null), ...tipos.map(([t]) => contarCamara(`${base}&siglaTipo=${t}`).catch(() => null))]);
    const [orgaos, frentes, recentes] = await Promise.all([
      getJSON(`${CAMARA}/deputados/${id}/orgaos?itens=100&ordem=DESC&ordenarPor=dataInicio`, { cache: 864e5 }).then(j => j.dados || []).catch(() => []),
      getJSON(`${CAMARA}/deputados/${id}/frentes`, { cache: 864e5 }).then(j => j.dados || []).catch(() => []),
      getJSON(`${CAMARA}/proposicoes?${base}&siglaTipo=PL,PEC,PLP,PDL&itens=10&ordem=DESC&ordenarPor=id`, { cache: 864e5 }).then(j => j.dados || []).catch(() => []),
    ]);
    const det = await Promise.all(recentes.map(r => getJSON(`${CAMARA}/proposicoes/${r.id}`, { cache: 864e5 }).then(j => j.dados).catch(() => null)));
    const atuais = orgaos.filter(o => !o.dataFim);
    const cargosImp = atuais.filter(o => !/^(Titular|Suplente)$/i.test(o.titulo || ''));
    setSec('pf-cam', `
      <div class="pf-nums">
        ${total != null ? `<div><b>${intl(total)}</b><small>proposições apresentadas (autor ou coautor)</small></div>` : ''}
        ${tipos.map(([t, nm], i) => porTipo[i] ? `<div><b>${intl(porTipo[i])}</b><small>${nm}</small></div>` : '').join('')}
        ${frentes.length ? `<div><b>${intl(frentes.length)}</b><small>frentes parlamentares</small></div>` : ''}
        <div><b>${intl(atuais.length)}</b><small>comissões e órgãos atuais</small></div>
      </div>
      ${cargosImp.length ? `<h5>Cargos de destaque</h5><ul class="pf-ul">${cargosImp.slice(0, 8).map(o => `<li><b>${esc(o.titulo)}</b> — ${esc(o.nomeOrgao || o.siglaOrgao)}</li>`).join('')}</ul>` : ''}
      ${recentes.length ? `<h5>Projetos mais recentes</h5><div class="pf-props">${recentes.map((r, i) => {
        const d = det[i], sit = d && d.statusProposicao ? d.statusProposicao.descricaoSituacao || '' : '';
        const lei = /norma jur[íi]dica/i.test(sit);
        return `<button class="pf-prop" data-act="open" data-url="https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${r.id}" data-title="${esc(r.siglaTipo + ' ' + r.numero + '/' + r.ano)}"><b>${esc(r.siglaTipo)} ${esc(r.numero)}/${esc(r.ano)}</b>${lei ? '<span class="pf-ok">virou lei</span>' : sit ? `<span class="pf-st">${esc(sit)}</span>` : ''}<p>${esc(r.ementa)}</p></button>`;
      }).join('')}</div>` : ''}
      ${atuais.length ? `<h5>Comissões e órgãos de que participa</h5><ul class="pf-ul" id="pf-org">${atuais.map(o => `<li>${esc(o.nomeOrgao || o.siglaOrgao)} <small>(${esc(o.titulo || '')})</small></li>`).join('')}</ul>` : ''}`);
  }

  async function senado(p) {
    const cod = p.senadoCod;
    const [mand, com, procs] = await Promise.all([
      getJSON(`${SENADO}/senador/${cod}/mandatos.json`, { cache: 7 * 864e5 }).then(j => [].concat(j.MandatoParlamentar.Parlamentar.Mandatos.Mandato || [])).catch(() => []),
      getJSON(`${SENADO}/senador/${cod}/comissoes.json`, { cache: 864e5 }).then(j => [].concat(j.MembroComissaoParlamentar.Parlamentar.MembroComissoes.Comissao || [])).catch(() => []),
      getJSON(`${SENADO}/processo?codigoParlamentarAutor=${cod}&v=1`, { cache: 864e5, timeout: 45000 }).catch(() => []),
    ]);
    const lst = Array.isArray(procs) ? procs : [];
    const porTipo = {};
    lst.forEach(x => { const t = x.tipoDocumento || 'Outros'; porTipo[t] = (porTipo[t] || 0) + 1; });
    const aprov = lst.filter(x => /APROVAD|NORMA|SANCION|PROMULG|TRANSFORMAD/i.test((x.situacaoAtual || '') + ' ' + (x.siglaTipoDeliberacao || ''))).length;
    const principais = lst.filter(x => !/Requerimento/i.test(x.tipoDocumento || '')).sort((a, b) => String(b.dataApresentacao).localeCompare(String(a.dataApresentacao))).slice(0, 10);
    const atuais = com.filter(c => !c.DataFim);
    setSec('pf-sen', `
      <div class="pf-nums">
        <div><b>${intl(lst.length)}</b><small>matérias de autoria ou coautoria</small></div>
        <div><b>${intl(aprov)}</b><small>aprovadas ou viraram norma</small></div>
        ${Object.entries(porTipo).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, n]) => `<div><b>${intl(n)}</b><small>${esc(t)}</small></div>`).join('')}
        <div><b>${intl(atuais.length)}</b><small>comissões atuais</small></div>
      </div>
      ${mand.length ? `<h5>Mandatos no Senado</h5><ul class="pf-ul">${mand.map(m => `<li>${esc(m.UfParlamentar)} · ${esc((m.PrimeiraLegislaturaDoMandato || {}).DataInicio || '').slice(0, 4)}–${esc((m.SegundaLegislaturaDoMandato || m.PrimeiraLegislaturaDoMandato || {}).DataFim || '').slice(0, 4)} <small>${esc(m.DescricaoParticipacao || '')}</small></li>`).join('')}</ul>` : ''}
      ${principais.length ? `<h5>Projetos mais recentes</h5><div class="pf-props">${principais.map(x => `<button class="pf-prop" data-act="open" data-url="https://www25.senado.leg.br/web/atividade/materias/-/materia/${esc(x.codigoMateria)}" data-title="${esc(x.identificacao)}"><b>${esc(x.identificacao)}</b>${/APROVAD|NORMA|SANCION|PROMULG/i.test(x.situacaoAtual || '') ? `<span class="pf-ok">${esc(x.situacaoAtual)}</span>` : `<span class="pf-st">${esc(x.situacaoAtual || '')}</span>`}<p>${esc(x.ementa)}</p></button>`).join('')}</div>` : ''}
      ${atuais.length ? `<h5>Comissões</h5><ul class="pf-ul">${atuais.slice(0, 15).map(c => `<li>${esc((c.IdentificacaoComissao || {}).NomeComissao || '')} <small>(${esc(c.DescricaoParticipacao || '')})</small></li>`).join('')}</ul>` : ''}`);
  }

  // câmaras municipais que usam o SAPL (Interlegis) publicam os projetos de cada vereador
  async function sapl(p) {
    const ci = cityInfo();
    const cidade = p.local || (ci && ci.nome) || '';
    const slug = fold(cidade).toLowerCase().replace(/\s+/g, '');
    const base = `https://sapl.${slug}.${(p.uf || '').toLowerCase()}.leg.br`;
    try {
      let parl = [];
      for (let page = 1; page <= 4; page++) {
        const j = await getJSON(`${base}/api/parlamentares/parlamentar/?page_size=100&page=${page}`, { cache: 7 * 864e5, timeout: 15000 });
        parl = parl.concat(j.results || []);
        if (!j.pagination || !j.pagination.next_page) break;
      }
      const alvo = [fold(p.nome), fold(p.nomeCompleto)];
      const v = parl.find(x => alvo.includes(fold(x.nome_parlamentar)) || alvo.includes(fold(x.nome_completo)))
        || parl.find(x => fold(x.nome_completo) && alvo[1] && (fold(x.nome_completo).includes(alvo[1]) || alvo[1].includes(fold(x.nome_completo))));
      if (!v) throw new Error('vereador não encontrado no SAPL');
      const autores = await getJSON(`${base}/api/base/autor/?search=${encodeURIComponent(v.nome_parlamentar)}&page_size=50`, { cache: 7 * 864e5 });
      const autor = (autores.results || []).find(a => a.object_id === v.id && (a.content_type === 2 || a.tipo === 2)) || (autores.results || []).find(a => fold(a.nome) === fold(v.nome_parlamentar));
      const tipos = await getJSON(`${base}/api/materia/tipomaterialegislativa/?page_size=100`, { cache: 30 * 864e5 }).then(j => j.results || []).catch(() => []);
      let total = 0, contagem = [], recentes = [];
      if (autor) {
        const t0 = await getJSON(`${base}/api/materia/materialegislativa/?autores=${autor.id}&page_size=1`, { cache: 864e5 });
        total = (t0.pagination || {}).total_entries || 0;
        const principais = tipos.filter(t => /projeto|indica|requer|mo[çc][ãa]o|emenda/i.test(t.descricao));
        contagem = await Promise.all(principais.map(t => getJSON(`${base}/api/materia/materialegislativa/?autores=${autor.id}&tipo=${t.id}&page_size=1`, { cache: 864e5 }).then(j => [t.descricao, (j.pagination || {}).total_entries || 0]).catch(() => [t.descricao, 0])));
        const projTipos = tipos.filter(t => /projeto/i.test(t.descricao));
        const listas = await Promise.all(projTipos.map(t => getJSON(`${base}/api/materia/materialegislativa/?autores=${autor.id}&tipo=${t.id}&page_size=6&o=-data_apresentacao`, { cache: 864e5 }).then(j => (j.results || []).map(r => Object.assign(r, { tipoNome: t.descricao }))).catch(() => [])));
        recentes = [].concat(...listas).sort((a, b) => String(b.data_apresentacao).localeCompare(String(a.data_apresentacao))).slice(0, 8);
      }
      const bio = v.biografia ? new DOMParser().parseFromString(v.biografia, 'text/html').body.textContent.replace(/Biografia atualizada em [^\n.]*/i, '').trim() : '';
      if (v.fotografia) { p.fotos = [https(v.fotografia)].concat(p.fotos || []); }
      setSec('pf-sapl', `
        ${bio ? `<p class="pf-bio">${esc(bio.slice(0, 1400))}${bio.length > 1400 ? '…' : ''}</p>` : ''}
        <div class="pf-nums">
          <div><b>${intl(total)}</b><small>matérias apresentadas</small></div>
          ${contagem.filter(c => c[1]).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, n]) => `<div><b>${intl(n)}</b><small>${esc(t)}</small></div>`).join('')}
        </div>
        ${recentes.length ? `<h5>Projetos mais recentes</h5><div class="pf-props">${recentes.map(r => `<button class="pf-prop" data-act="open" data-url="${esc(base + '/materia/' + r.id)}" data-title="${esc(r.__str__)}"><b>${esc(r.__str__)}</b>${r.em_tramitacao ? '<span class="pf-st">em tramitação</span>' : '<span class="pf-ok">tramitação encerrada</span>'}<p>${esc(String(r.ementa || '').slice(0, 300))}</p></button>`).join('')}</div>` : ''}
        <button class="btn ghost small" data-act="open" data-url="${esc(base + '/parlamentar/' + v.id)}" data-title="${esc(v.nome_parlamentar)}">Ver tudo na Câmara Municipal ↗</button>`);
    } catch (e) {
      setSec('pf-sapl', `<p class="muted">A Câmara Municipal de ${esc(cidade)} não publica os projetos dos vereadores no sistema SAPL (ou não respondeu agora). Veja a carreira e as notícias abaixo.</p>`);
    }
  }

  async function wiki(p) {
    const nomes = [p.nomeCompleto, p.nome].filter(Boolean);
    try {
      let achou = null;
      for (const n of nomes) {
        const s = await getJSON(`https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(n + ' político')}&srlimit=3&format=json&origin=*`, { cache: 7 * 864e5, timeout: 15000 });
        const hits = ((s.query || {}).search || []).filter(h => fold(h.title).split(' ').filter(w => w.length > 2).every(w => fold(n).includes(w)) || fold(n).includes(fold(h.title)));
        if (hits.length) { achou = hits[0].title; break; }
      }
      if (!achou) throw new Error('sem artigo');
      const r = await getJSON(`https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(achou.replace(/ /g, '_'))}`, { cache: 7 * 864e5 });
      if (!r.extract || !/pol[íi]tic|deputad|senador|prefeit|vereador|governad/i.test(r.extract + ' ' + (r.description || ''))) throw new Error('não é político');
      setSec('pf-wiki', `<p class="pf-bio">${esc(r.extract)}</p><button class="btn ghost small" data-act="open" data-url="${esc((r.content_urls && r.content_urls.mobile && r.content_urls.mobile.page) || 'https://pt.wikipedia.org/wiki/' + encodeURIComponent(achou))}" data-title="Wikipédia">Ler mais na Wikipédia ↗</button>`);
    } catch (e) {
      setSec('pf-wiki', null);
    }
  }

  window.Politicos = { mount, unmount, onAct, renderPerfil, _st: st, _people: people };
})();
