/* Radar Político — lógica do app */
(function () {
  'use strict';

  const CAP = window.Capacitor;
  const isNative = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
  const Plugins = (CAP && CAP.Plugins) || {};
  const CHECK_EVERY_MS = 30 * 60 * 1000; // re-verifica a cada 30 min com o app aberto
  const FETCH_TIMEOUT = 25000;
  const MAX_FEED = 400;

  // ---------- armazenamento ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* cheio */ } },
  };

  // ---------- fontes (fixas + personalizadas) ----------
  function allSources() {
    const custom = store.get('customSources', []);
    const party = store.get('partyUrl', '');
    const list = SOURCES.map(s => {
      if (s.partyEditable && party) {
        return Object.assign({}, s, {
          links: [{ label: 'Site do meu partido', url: party }].concat(s.links),
          monitors: s.monitors.concat([{ url: party, type: 'links' }]),
        });
      }
      return s;
    });
    custom.forEach(c => list.push({
      id: c.id, group: 'Meus sites', icon: '⭐', color: '#5a6b85', custom: true,
      title: c.title, subtitle: hostOf(c.url), desc: 'Site adicionado por você. O app acompanha as novidades dele.',
      links: [{ label: 'Abrir site', url: c.url }],
      monitors: [{ url: c.url, type: 'links' }],
    }));
    return list;
  }
  const byId = id => allSources().find(s => s.id === id);

  // ---------- utilidades ----------
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\d*\./, ''); } catch (e) { return u; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function hash(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); }
  function ago(ts) {
    if (!ts) return 'nunca';
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'agora';
    if (m < 60) return `há ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `há ${h} h`;
    return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }
  function fullDate(ts) { return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  function withTimeout(p, ms) { return Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('Tempo esgotado')), ms))]); }

  async function getText(url) {
    // No APK, o fetch passa pelo HTTP nativo (CapacitorHttp) e lê qualquer site oficial.
    const res = await withTimeout(fetch(url, { headers: {
      'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
    } }), FETCH_TIMEOUT);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  }

  // ---------- favoritos ----------
  const favs = () => store.get('favorites', []);
  const isFav = url => favs().some(f => f.url === url);
  function toggleFav(url, title) {
    if (!url) return false;
    const list = favs();
    const i = list.findIndex(f => f.url === url);
    if (i >= 0) { list.splice(i, 1); store.set('favorites', list); toast('Removido dos Favoritos'); return false; }
    list.unshift({ url, title: (title || '').trim() || hostOf(url), at: Date.now() });
    store.set('favorites', list.slice(0, 300));
    toast('⭐ Salvo nos Favoritos');
    return true;
  }
  function removeFav(url) { store.set('favorites', favs().filter(f => f.url !== url)); }
  function favStar(url, title) {
    return `<b class="fav ${isFav(url) ? 'on' : ''}" data-act="fav" data-url="${esc(url)}" data-title="${esc(title || '')}" aria-label="Salvar nos Favoritos">${isFav(url) ? '★' : '☆'}</b>`;
  }

  // navegador interno com botão ⭐ "Salvar página" na barra
  const IAB = Plugins.InAppBrowser;
  const iab = { url: '', title: '', pending: null };
  function iabToast(msg) {
    if (!IAB) return;
    const code = `(function(){var d=document.createElement('div');d.textContent=${JSON.stringify(msg)};d.style.cssText='position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;background:#072014;color:#ffdf00;font:600 15px system-ui,sans-serif;padding:12px 18px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.4);border:1px solid #ffdf00';document.body.appendChild(d);setTimeout(function(){d.remove()},2200)})()`;
    IAB.executeScript({ code }).catch(() => {});
  }
  function favFromBrowser(url, title) {
    const saved = toggleFav(url, title);
    iabToast(saved ? '⭐ Página salva nos Favoritos' : 'Removida dos Favoritos');
    render();
  }
  if (isNative && IAB) {
    IAB.addListener('urlChangeEvent', ev => { if (ev && ev.url) { iab.url = ev.url; iab.title = ''; } });
    IAB.addListener('browserPageLoaded', () => {
      IAB.executeScript({ code: "window.mobileApp&&window.mobileApp.postMessage(JSON.stringify({detail:{kind:'info',t:document.title,u:location.href}}))" }).catch(() => {});
    });
    IAB.addListener('messageFromWebview', ev => {
      let d = ev && ev.detail;
      if (!d && ev && ev.rawMessage) { try { d = JSON.parse(ev.rawMessage).detail; } catch (e) { d = null; } }
      if (!d) return;
      if (d.u) iab.url = d.u;
      if (d.t) iab.title = d.t;
      if (d.kind === 'fav' && iab.pending) { clearTimeout(iab.pending); iab.pending = null; favFromBrowser(d.u || iab.url, d.t || iab.title); }
    });
    IAB.addListener('buttonNearDoneClick', () => {
      if (iab.pending) return;
      iab.pending = setTimeout(() => { iab.pending = null; favFromBrowser(iab.url, iab.title); }, 1500);
      IAB.executeScript({ code: "window.mobileApp&&window.mobileApp.postMessage(JSON.stringify({detail:{kind:'fav',t:document.title,u:location.href}}))" }).catch(() => {});
    });
    IAB.addListener('closeEvent', () => render());
  }

  function openUrl(url, title) {
    if (isNative && IAB) {
      iab.url = url; iab.title = title || '';
      IAB.openWebView({
        url, title: title || hostOf(url), toolbarColor: '#072014', toolbarTextColor: '#ffffff', showReloadButton: true,
        activeNativeNavigationForWebview: true,
        buttonNearDone: { ios: { iconType: 'sf-symbol', icon: 'star' }, android: { iconType: 'asset', icon: 'public/star.svg', width: 26, height: 26 } },
      }).catch(() => { if (Plugins.Browser) Plugins.Browser.open({ url, toolbarColor: '#072014' }); });
    } else if (isNative && Plugins.Browser) Plugins.Browser.open({ url, toolbarColor: '#072014' });
    else window.open(url, '_blank', 'noopener');
  }

  // ---------- extração ----------
  const JUNK = /(acessibilidade|mapa do site|pular para|ir para o conte|cookies?|pol[ií]tica de privacidade|fale conosco|ouvidoria|alto contraste|termos de uso|todos os direitos|login|entrar|cadastre-se|compartilhar|whatsapp|facebook|instagram|twitter|youtube|linkedin|^mais not[ií]cias$|^veja mais$|^leia mais$|^saiba mais$)/i;

  function extractLinks(html, baseUrl) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,noscript,header nav,footer,nav').forEach(n => n.remove());
    const seen = new Set();
    const out = [];
    doc.querySelectorAll('a[href]').forEach(a => {
      let text = (a.textContent || a.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
      if (text.length < 28 || text.length > 240 || JUNK.test(text)) return;
      let href;
      try { href = new URL(a.getAttribute('href'), baseUrl).href.split('#')[0]; } catch (e) { return; }
      if (!/^https?:/.test(href)) return;
      const key = href + '|' + text.slice(0, 60);
      if (seen.has(href) || seen.has(key)) return;
      seen.add(href); seen.add(key);
      out.push({ id: hash(href + text), title: text, url: href });
    });
    return out.slice(0, 50);
  }

  function pageText(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,noscript').forEach(n => n.remove());
    return (doc.body ? doc.body.textContent : html).replace(/\s+/g, ' ').trim();
  }

  // ---------- verificação de um monitor ----------
  async function runMonitor(src, mon) {
    const key = 'snap:' + mon.url;
    const prev = store.get(key, null);
    const firstRun = !prev;
    const now = Date.now();
    const news = [];
    let items = [];
    if (mon.type === 'leis' && window.Leis) return window.Leis.runMonitor(mon, key, prev, store, getText);

    if (mon.type === 'camara-api') {
      const json = JSON.parse(await getText(mon.url));
      items = (json.dados || []).map(p => ({
        id: 'cam' + p.id,
        title: `${p.siglaTipo} ${p.numero}/${p.ano} — ${(p.ementa || '').trim()}`,
        url: 'https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=' + p.id,
      }));
    } else if (mon.type === 'hash') {
      const text = pageText(await getText(mon.url));
      const h = hash(text);
      if (prev && prev.hash && prev.hash !== h) {
        const diff = text.length - (prev.len || 0);
        news.push({
          id: 'law' + h, title: `Texto alterado: ${mon.label || hostOf(mon.url)}`,
          detail: diff === 0 ? 'O conteúdo oficial mudou.' : `O texto oficial mudou (${diff > 0 ? '+' : ''}${diff} caracteres). Confira a nova redação.`,
          url: mon.url, kind: 'lei',
        });
      }
      store.set(key, { hash: h, len: text.length, checkedAt: now, ok: true });
      return { news, items: [{ id: 'law-' + mon.url, title: mon.label || hostOf(mon.url), url: mon.url, meta: `Texto conferido ${ago(now)} · ${text.length.toLocaleString('pt-BR')} caracteres` }] };
    } else {
      items = extractLinks(await getText(mon.url), mon.url);
    }

    if (!items.length) throw new Error('Página sem conteúdo legível');
    const known = new Set(prev && prev.ids || []);
    if (!firstRun) items.forEach(it => { if (!known.has(it.id)) news.push(Object.assign({ kind: mon.type === 'camara-api' ? 'projeto' : 'noticia' }, it)); });
    // guarda os ids conhecidos (mantém os antigos para não "renovar" itens que saem e voltam)
    const ids = items.map(i => i.id).concat([...known]).slice(0, 600);
    store.set(key, { ids, checkedAt: now, ok: true });
    return { news, items };
  }

  // ---------- verificação de todas as fontes ----------
  let checking = false;
  async function checkAll(manual) {
    if (checking) return;
    checking = true;
    setSyncState(true, 'Verificando sites oficiais…');
    const sources = allSources().filter(s => s.monitors.length);
    let total = 0, failed = 0, done = 0;
    const feed = store.get('feed', []);
    const feedIds = new Set(feed.map(f => f.sourceId + f.id));

    await Promise.all(sources.map(async src => {
      const latest = [];
      let srcErr = null;
      for (const mon of src.monitors) {
        try {
          const r = await runMonitor(src, mon);
          latest.push(...r.items);
          r.news.forEach(n => {
            if (feedIds.has(src.id + n.id)) return;
            feedIds.add(src.id + n.id);
            feed.unshift(Object.assign({ sourceId: src.id, at: Date.now(), read: false }, n));
            total++;
          });
        } catch (e) {
          srcErr = e.message || 'erro';
          failed++;
        }
      }
      if (latest.length) store.set('latest:' + src.id, latest.slice(0, 60));
      store.set('status:' + src.id, { at: Date.now(), err: latest.length ? null : srcErr });
      done++;
      setSyncState(true, `Verificando… ${done}/${sources.length}`);
    }));

    store.set('feed', feed.slice(0, MAX_FEED));
    store.set('lastCheck', Date.now());
    checking = false;
    setSyncState(false);
    render();

    if (total > 0) {
      toast(`${total} novidade${total > 1 ? 's' : ''} encontrada${total > 1 ? 's' : ''}`);
      notify(total);
    } else if (manual) {
      toast(failed && !isNative ? 'No navegador os sites bloqueiam a leitura — no APK funciona normalmente.' : 'Tudo em dia. Nenhuma novidade desde a última verificação.');
    }
  }

  async function notify(n) {
    if (!isNative || !Plugins.LocalNotifications) return;
    try {
      const perm = await Plugins.LocalNotifications.requestPermissions();
      if (perm.display !== 'granted') return;
      await Plugins.LocalNotifications.schedule({ notifications: [{
        id: Math.floor(Date.now() / 1000) % 2147483647,
        title: 'Radar Político — Nova notícia',
        body: `${n} atualização${n > 1 ? 'ões' : ''} nos sites oficiais. Toque para ver.`,
      }] });
    } catch (e) { /* sem permissão */ }
  }

  // ---------- interface ----------
  const $app = document.getElementById('app');
  let view = { name: 'home' };
  const stack = [];

  function go(v) { stack.push(view); view = v; render(); window.scrollTo(0, 0); }
  function back() { if (stack.length) { view = stack.pop(); render(); return true; } return false; }

  function unreadCount() { return store.get('feed', []).filter(f => !f.read).length; }

  function render() {
    if (window.Eleicao && view.name !== 'election') Eleicao.unmount();
    if (window.Politicos && view.name !== 'infopoliticos') Politicos.unmount();
    if (view.name === 'infopoliticos' && window.Politicos) return Politicos.mount($app, topbar('Info Políticos', true));
    if (view.name === 'election') return Eleicao.mount($app, topbar('Votação em tempo real', true));
    if (view.name === 'home') renderHome();
    else if (view.name === 'source') renderSource(view.id);
    else if (view.name === 'feed') renderFeed();
    else if (view.name === 'settings') renderSettings();
    else if (view.name === 'favorites') renderFavorites();
    else if (view.name === 'politico' && window.Politicos) window.Politicos.renderPerfil($app, topbar('Info Políticos', true), view.pid);
    else if (view.name === 'lei' && window.Leis) window.Leis.renderChange($app, topbar('Mudança na lei', true), view.ev);
    else if (view.name === 'leiresumo' && window.Leis) window.Leis.renderSummary($app, topbar('Interpretação', true), view.id);
  }

  function topbar(title, withBack, right) {
    return `<header class="topbar">
      ${withBack ? '<button class="icon-btn" data-act="back" aria-label="Voltar">‹</button>' : '<div class="brand-dot"></div>'}
      <h1>${esc(title)}</h1>
      ${right || '<span class="spacer"></span>'}
    </header>
    <div id="sync" class="sync hidden"><span class="spin"></span><span class="sync-text"></span></div>`;
  }

  function renderHome() {
    const unread = unreadCount();
    const last = store.get('lastCheck', 0);
    const feed = store.get('feed', []);
    const preview = feed.slice(0, 2);
    const sources = allSources();
    const groups = GROUP_ORDER.filter(g => sources.some(s => s.group === g));

    $app.innerHTML = topbar('Radar Político', false, '<button class="icon-btn" data-act="settings" aria-label="Ajustes">⚙</button>') + `
      <main class="home">
        <button class="news-card" data-act="feed">
          <div class="news-head">
            <span class="news-icon">📰</span>
            <div class="news-titles"><strong>Nova notícia</strong><small>Tudo que mudou nos outros cards</small></div>
            ${unread ? `<span class="badge">${unread > 99 ? '99+' : unread}</span>` : ''}
          </div>
          <div class="news-preview">
            ${preview.length ? preview.map(f => {
              const s = byId(f.sourceId);
              return `<div class="np-item ${f.read ? '' : 'unread'}"><span class="np-src">${esc(s ? s.title : '')}</span><span class="np-title">${esc(f.title)}</span></div>`;
            }).join('') : `<div class="np-empty">${last ? 'Nenhuma novidade desde que o monitoramento começou.' : 'Primeira verificação em andamento — a partir dela, toda mudança aparece aqui.'}</div>`}
          </div>
          <div class="news-foot">Última verificação: ${ago(last)} <span class="refresh" data-act="refresh">↻ Atualizar</span></div>
        </button>

        ${groups.map(g => `
          <section class="group">
            <h2>${esc(g)}</h2>
            <div class="grid">
              ${sources.filter(s => s.group === g).map(s => cardHTML(s, feed)).join('')}
            </div>
          </section>`).join('')}
        <p class="foot-note">Informações lidas diretamente dos sites oficiais. Toque em um card para ver o conteúdo atual.</p>
      </main>`;
  }

  function cardHTML(s, feed) {
    const n = feed.filter(f => f.sourceId === s.id && !f.read).length;
    const st = store.get('status:' + s.id, null);
    return `<button class="card${s.special ? ' wide' : ''}" data-act="source" data-id="${esc(s.id)}" style="--c:${s.color}">
      <span class="card-icon">${s.icon}</span>
      ${n ? `<span class="badge small">${n}</span>` : ''}
      <strong>${esc(s.title)}</strong>
      <small>${esc(s.subtitle)}</small>
      ${s.monitors.length ? `<span class="card-status ${st && st.err ? 'err' : ''}">${st ? (st.err ? 'falha: ' + esc(String(st.err).slice(0, 38)) : 'atualizado ' + ago(st.at)) : 'monitorando'}</span>` : (s.special === 'favorites' ? `<span class="card-status">${favs().length} página(s) salva(s)</span>` : s.special === 'politicos' ? '<span class="card-status live">● TSE · Câmara · Senado</span>' : s.special ? '<span class="card-status live">● ao vivo · TSE</span>' : '<span class="card-status">acesso direto</span>')}
    </button>`;
  }

  function renderSource(id) {
    const s = byId(id);
    if (!s) { view = { name: 'home' }; return render(); }
    // marca as novidades desta fonte como lidas
    const feed = store.get('feed', []);
    const mine = feed.filter(f => f.sourceId === id);
    const newIds = new Set(mine.filter(f => !f.read).map(f => f.id));
    if (newIds.size) { feed.forEach(f => { if (f.sourceId === id) f.read = true; }); store.set('feed', feed); }

    const latest = store.get('latest:' + id, []);
    const st = store.get('status:' + id, null);

    $app.innerHTML = topbar(s.title, true) + `
      <main class="detail">
        <div class="hero" style="--c:${s.color}">
          <span class="hero-icon">${s.icon}</span>
          <div><h2>${esc(s.title)}</h2><p>${esc(s.subtitle)}</p></div>
        </div>
        <p class="desc">${esc(s.desc)}</p>

        ${s.partyEditable ? `<button class="btn ghost" data-act="party">🚩 ${store.get('partyUrl', '') ? 'Trocar site do meu partido' : 'Definir site do meu partido'}</button>` : ''}

        <h3>Acesso oficial</h3>
        <div class="links">
          ${s.links.map(l => `<button class="link-row" data-act="open" data-url="${esc(l.url)}" data-title="${esc(l.label)}"><span>${esc(l.label)}</span><small>${esc(hostOf(l.url))}</small>${favStar(l.url, l.label)}<b>↗</b></button>`).join('')}
        </div>

        ${s.id === 'planalto' && window.Leis ? window.Leis.lawsSection() : ''}

        ${s.monitors.length ? `
          <h3>Conteúdo mais recente <small class="h-meta">${st ? 'verificado ' + ago(st.at) : ''}</small></h3>
          ${st && st.err && !latest.length ? `<div class="warn">Não foi possível ler o site agora (${esc(st.err)}). Use os botões acima para abrir o site oficial.</div>` : ''}
          ${latest.length ? `<div class="items">${latest.map(it => `
            <button class="item ${newIds.has(it.id) ? 'is-new' : ''}" data-act="open" data-url="${esc(it.url)}" data-title="${esc(it.title)}">
              ${newIds.has(it.id) ? '<span class="tag">NOVO</span>' : ''}
              <span class="item-title">${esc(it.title)}</span>${favStar(it.url, it.title)}
              <small>${esc(it.meta || hostOf(it.url))}</small>
            </button>`).join('')}</div>`
            : (!st ? '<div class="muted">Carregando conteúdo dos sites oficiais…</div>' : '')}
          <button class="btn" data-act="refresh">↻ Atualizar agora</button>
        ` : `<div class="muted">Este serviço exige login ou consulta pessoal, então o app abre direto o sistema oficial.</div>`}
        ${s.custom ? `<button class="btn danger" data-act="remove-custom" data-id="${esc(s.id)}">Remover este site</button>` : ''}
      </main>`;
  }

  function renderFeed() {
    const feed = store.get('feed', []);
    const filter = view.filter || 'all';
    const list = feed.filter(f => filter === 'all' || (filter === 'unread' && !f.read) || f.kind === filter);
    const last = store.get('lastCheck', 0);

    $app.innerHTML = topbar('Nova notícia', true, feed.length ? '<button class="icon-btn" data-act="mark-all" aria-label="Marcar tudo como lido">✓</button>' : '') + `
      <main class="feed">
        <div class="chips">
          ${[['all', 'Tudo'], ['unread', 'Não lidas'], ['lei', 'Leis alteradas'], ['projeto', 'Projetos de lei'], ['noticia', 'Notícias']]
            .map(([k, l]) => `<button class="chip ${filter === k ? 'on' : ''}" data-act="filter" data-f="${k}">${l}</button>`).join('')}
        </div>
        <div class="feed-meta">Última verificação: ${last ? fullDate(last) : 'em andamento'} · <span class="refresh" data-act="refresh">↻ Atualizar</span></div>
        ${list.length ? list.map((f, i) => {
          const s = byId(f.sourceId);
          return `<button class="feed-item ${f.read ? '' : 'unread'} kind-${esc(f.kind)}" data-act="feed-open" data-i="${feed.indexOf(f)}">
            <div class="fi-top"><span class="fi-src" style="--c:${s ? s.color : '#555'}">${s ? s.icon + ' ' + esc(s.title) : ''}</span><span class="fi-when">${ago(f.at)}</span></div>
            <div class="fi-title">${esc(f.title)}</div>
            ${f.detail ? `<div class="fi-detail">${esc(f.detail)}</div>` : ''}
          </button>`;
        }).join('') : `<div class="empty"><div class="empty-icon">🗞️</div><p>${feed.length ? 'Nada neste filtro.' : 'Ainda não há novidades.'}</p><small>O app compara os sites oficiais a cada verificação. Quando algo novo for publicado ou uma lei for alterada, aparece aqui.</small></div>`}
      </main>`;
  }

  function renderFavorites() {
    const list = favs();
    $app.innerHTML = topbar('Favoritos', true) + `
      <main class="detail">
        <p class="desc">Para salvar uma página: abra qualquer site pelo app e toque na <b>⭐</b> no canto de cima. Você também pode tocar na ☆ ao lado dos links dentro dos cards.</p>
        ${list.length ? `<div class="links">${list.map(f => `
          <div class="fav-row">
            <button class="fav-open" data-act="open" data-url="${esc(f.url)}" data-title="${esc(f.title)}">
              <span>${esc(f.title)}</span><small>${esc(hostOf(f.url))} · salvo ${ago(f.at)}</small>
            </button>
            <button class="fav-del" data-act="fav-remove" data-url="${esc(f.url)}" aria-label="Remover dos Favoritos">✕</button>
          </div>`).join('')}</div>`
          : `<div class="empty"><div class="empty-icon">⭐</div><p>Nenhuma página salva ainda.</p><small>Abra um site pelo app e toque na estrela para guardar aqui.</small></div>`}
      </main>`;
  }

  function renderSettings() {
    const custom = store.get('customSources', []);
    $app.innerHTML = topbar('Ajustes', true) + `
      <main class="detail">
        <h3>Adicionar site para acompanhar</h3>
        <p class="desc">Ex.: site do seu partido, de um vereador ou da prefeitura. Ele vira um card e entra no Nova notícia.</p>
        <input id="c-title" class="input" placeholder="Nome do card (ex.: Prefeitura do Cabo)">
        <input id="c-url" class="input" placeholder="Endereço (ex.: https://www.cabo.pe.gov.br)" inputmode="url">
        <button class="btn" data-act="add-custom">+ Adicionar card</button>
        ${custom.length ? `<h3>Meus sites</h3><div class="links">${custom.map(c => `<div class="link-row"><span>${esc(c.title)}</span><small>${esc(hostOf(c.url))}</small><b class="x" data-act="remove-custom" data-id="${esc(c.id)}">✕</b></div>`).join('')}</div>` : ''}
        ${window.Leis ? window.Leis.settingsHtml() : ''}
        <h3>Dados do app</h3>
        <p class="desc">O app verifica os sites ao abrir, ao voltar para ele e a cada 30 minutos enquanto estiver aberto.</p>
        <button class="btn ghost" data-act="reset">Zerar histórico de novidades</button>
      </main>`;
  }

  function setSyncState(on, text) {
    const el = document.getElementById('sync');
    if (!el) return;
    el.classList.toggle('hidden', !on);
    if (text) el.querySelector('.sync-text').textContent = text;
  }

  let toastTimer;
  function toast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
  }

  function normalizeUrl(u) {
    u = (u || '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    try { return new URL(u).href; } catch (e) { return ''; }
  }

  // ---------- eventos ----------
  $app.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act.startsWith('lei-') && window.Leis && window.Leis.onAct(act, el)) return;
    if (act.startsWith('ip-') && window.Politicos && window.Politicos.onAct(act, el)) return;
    if (act === 'refresh') { e.stopPropagation(); checkAll(true); return; }
    if (act === 'back') return back();
    if (act === 'settings') return go({ name: 'settings' });
    if (act === 'feed') return go({ name: 'feed', filter: 'all' });
    if (act === 'source') { const s = byId(el.dataset.id); if (s && s.special === 'election') return go({ name: 'election' }); if (s && s.special === 'favorites') return go({ name: 'favorites' }); if (s && s.special === 'politicos') return go({ name: 'infopoliticos' }); return go({ name: 'source', id: el.dataset.id }); }
    if (act === 'open') return openUrl(el.dataset.url, el.dataset.title);
    if (act === 'fav') { toggleFav(el.dataset.url, el.dataset.title); render(); return; }
    if (act === 'fav-remove') { removeFav(el.dataset.url); render(); toast('Removido dos Favoritos'); return; }
    if (act === 'filter') { view.filter = el.dataset.f; return render(); }
    if (act === 'feed-open') {
      const feed = store.get('feed', []);
      const f = feed[+el.dataset.i];
      if (f) { f.read = true; store.set('feed', feed); if (f.kind === 'lei' && f.ev && window.Leis) return go({ name: 'lei', ev: f.ev }); render(); openUrl(f.url, f.title); }
      return;
    }
    if (act === 'mark-all') {
      const feed = store.get('feed', []); feed.forEach(f => f.read = true); store.set('feed', feed); render(); toast('Tudo marcado como lido'); return;
    }
    if (act === 'party') {
      const cur = store.get('partyUrl', '');
      const v = prompt('Endereço do site oficial do seu partido (geralmente termina em .org.br):', cur || 'https://');
      if (v === null) return;
      const url = normalizeUrl(v);
      if (v.trim() && !url) return toast('Endereço inválido');
      store.set('partyUrl', url);
      render(); if (url) checkAll(false);
      return;
    }
    if (act === 'add-custom') {
      const title = document.getElementById('c-title').value.trim();
      const url = normalizeUrl(document.getElementById('c-url').value);
      if (!title || !url) return toast('Preencha o nome e um endereço válido');
      const custom = store.get('customSources', []);
      custom.push({ id: 'c' + Date.now(), title, url });
      store.set('customSources', custom);
      toast('Card adicionado'); render(); checkAll(false);
      return;
    }
    if (act === 'remove-custom') {
      e.stopPropagation();
      if (!confirm('Remover este site?')) return;
      store.set('customSources', store.get('customSources', []).filter(c => c.id !== el.dataset.id));
      if (view.name === 'source') back(); else render();
      return;
    }
    if (act === 'reset') {
      if (!confirm('Apagar todo o histórico de novidades? O monitoramento recomeça do zero.')) return;
      Object.keys(localStorage).filter(k => /^(snap:|latest:|status:)/.test(k) || k === 'feed' || k === 'lastCheck').forEach(k => localStorage.removeItem(k));
      toast('Histórico zerado'); view = { name: 'home' }; stack.length = 0; render(); checkAll(false);
    }
  });

  // botão voltar do Android
  if (isNative && Plugins.App) {
    Plugins.App.addListener('backButton', () => { if (!back()) Plugins.App.exitApp(); });
    Plugins.App.addListener('resume', () => {
      if (Date.now() - store.get('lastCheck', 0) > 10 * 60 * 1000) checkAll(false);
    });
  }
  if (isNative && Plugins.LocalNotifications) {
    Plugins.LocalNotifications.addListener('localNotificationActionPerformed', () => { stack.length = 0; view = { name: 'home' }; go({ name: 'feed', filter: 'unread' }); });
  }

  window.App = { go, back, toast, openUrl, store, render, topbar };

  // ---------- início ----------
  render();
  checkAll(false);
  setInterval(() => checkAll(false), CHECK_EVERY_MS);
})();
