"""Monitora as leis no site do Planalto e registra, artigo por artigo, o que mudou.

Roda no GitHub Actions (workflow "Monitorar leis") a cada 6 horas.
- data/leis/<id>.json   -> última versão conhecida de cada lei (texto de cada artigo)
- data/leis/mudancas.json -> situação das leis + lista das últimas mudanças detectadas
"""
import json, os, re, sys, time, urllib.request
from datetime import datetime, timezone, timedelta
from html.parser import HTMLParser

LEIS = [
    ('cf88', 'Constituição Federal', 'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm'),
    ('l9504', 'Lei das Eleições (Lei 9.504/1997)', 'https://www.planalto.gov.br/ccivil_03/leis/l9504.htm'),
    ('lc64', 'Lei de Inelegibilidade (LC 64/1990)', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp64.htm'),
    ('lc135', 'Lei da Ficha Limpa (LC 135/2010)', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp135.htm'),
    ('l9096', 'Lei dos Partidos Políticos (Lei 9.096/1995)', 'https://www.planalto.gov.br/ccivil_03/leis/l9096.htm'),
    ('l4737', 'Código Eleitoral (Lei 4.737/1965)', 'https://www.planalto.gov.br/ccivil_03/leis/l4737compilado.htm'),
]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'leis')
MAX_EVENTOS = 40
MAX_TXT = 20000
BRT = timezone(timedelta(hours=-3))

BLOCK = {'p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr', 'table', 'blockquote', 'center', 'td', 'ul', 'ol'}
SKIP = {'strike', 's', 'del', 'script', 'style', 'head', 'title'}


class Texto(HTMLParser):
    """Extrai as linhas do texto em vigor (ignora trechos riscados = redação antiga)."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.lines, self.cur, self.stack, self.skip = [], [], [], 0

    def flush(self):
        t = ' '.join(''.join(self.cur).split())
        if t:
            self.lines.append(t)
        self.cur = []

    def handle_starttag(self, tag, attrs):
        if tag == 'br':
            self.flush()
            return
        style = (dict(attrs).get('style') or '').lower().replace(' ', '')
        sk = tag in SKIP or 'line-through' in style
        self.stack.append((tag, sk))
        if sk:
            self.skip += 1
        if tag in BLOCK:
            self.flush()

    def handle_startendtag(self, tag, attrs):
        if tag == 'br' or tag in BLOCK:
            self.flush()

    def handle_endtag(self, tag):
        if tag in BLOCK:
            self.flush()
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                for _, sk in self.stack[i:]:
                    if sk:
                        self.skip -= 1
                del self.stack[i:]
                break

    def handle_data(self, d):
        if self.skip <= 0:
            self.cur.append(d)


ART = re.compile(r'^Art\.?\s*(\d+)\s*(?:[º°ºªo]|o\.)?\s*(?:[-–]\s*([A-Z]{1,3}))?(?=[\s.\-–:]|$)')
TITULO = re.compile(r'^(T[ÍI]TULO|CAP[ÍI]TULO|Se[çc][ãa]o|SE[ÇC][ÃA]O|Subse[çc][ãa]o|LIVRO|PARTE)\b')
LIXO = re.compile(r'(Presid[êe]ncia da Rep[úu]blica|Casa Civil|Subchefia para Assuntos|Secretaria Especial para Assuntos|Este texto n[ãa]o substitui)', re.I)


def baixar(url):
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.5',
    })
    with urllib.request.urlopen(req, timeout=120) as r:
        raw = r.read()
        cs = r.headers.get_content_charset()
    if not cs:
        m = re.search(rb'charset=["\']?([\w-]+)', raw[:4000], re.I)
        cs = m.group(1).decode() if m else 'cp1252'
    if cs.lower() in ('iso-8859-1', 'latin-1', 'latin1'):
        cs = 'cp1252'
    return raw.decode(cs, errors='replace')


def artigos(html):
    p = Texto()
    p.feed(html)
    p.flush()
    arts, ordem = {}, []
    atual, prefixo = 'Preâmbulo', ''
    arts[atual] = []
    ordem.append(atual)
    for ln in p.lines:
        if LIXO.search(ln) and atual == 'Preâmbulo':
            continue
        if re.search(r'ATO DAS DISPOSI[ÇC][ÕO]ES CONSTITUCIONAIS TRANSIT[ÓO]RIAS', ln, re.I) and len(ln) < 80:
            prefixo = 'ADCT '
            continue
        m = ART.match(ln)
        if m:
            k = f"{prefixo}Art. {m.group(1)}" + (f"-{m.group(2).upper()}" if m.group(2) else '')
            base, n = k, 2
            while k in arts:
                k = f'{base} ({n})'
                n += 1
            atual = k
            arts[atual] = []
            ordem.append(atual)
        elif TITULO.match(ln) or (ln.isupper() and len(ln) < 120 and not re.match(r'^[IVXLC]+\s*[-–]', ln)):
            continue  # títulos e capítulos não entram no texto do artigo
        arts[atual].append(ln)
    return {k: '\n'.join(arts[k]) for k in ordem if arts[k]}


def norm(t):
    t = t.replace('º', 'o').replace('°', 'o').replace('ª', 'a')
    t = re.sub(r'[“”"]', '"', t).replace('’', "'").replace('–', '-').replace('—', '-')
    return ' '.join(t.split()).strip()


def notas(t):
    return re.findall(r'\((?:Reda[çc][ãa]o dada|Inclu[íi]d[oa]|Revogad[oa]|Acrescid[oa]|Vide|Renumerad[oa]|Regulamento)[^()]*(?:\([^()]*\)[^()]*)*\)', t)


def comparar(antigo, novo):
    mud = []
    for k, txt in novo.items():
        if k == 'Preâmbulo':
            continue
        if k not in antigo:
            mud.append({'art': k, 'tipo': 'incluido', 'antes': '', 'depois': txt[:MAX_TXT], 'notas': notas(txt)})
        elif norm(antigo[k]) != norm(txt):
            tipo = 'revogado' if re.search(r'revogad', txt, re.I) and not re.search(r'revogad', antigo[k], re.I) and len(txt) < len(antigo[k]) else 'alterado'
            nn = [n for n in notas(txt) if n not in notas(antigo[k])] or notas(txt)
            mud.append({'art': k, 'tipo': tipo, 'antes': antigo[k][:MAX_TXT], 'depois': txt[:MAX_TXT], 'notas': nn})
    for k, txt in antigo.items():
        if k != 'Preâmbulo' and k not in novo:
            mud.append({'art': k, 'tipo': 'removido', 'antes': txt[:MAX_TXT], 'depois': '', 'notas': []})
    return mud


def carregar(path, default):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default


def salvar(path, obj):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))


def main():
    os.makedirs(OUT, exist_ok=True)
    agora = datetime.now(BRT).strftime('%Y-%m-%dT%H:%M:%S-03:00')
    mpath = os.path.join(OUT, 'mudancas.json')
    m = carregar(mpath, {'eventos': [], 'leis': []})
    status = {x['id']: x for x in m.get('leis', [])}
    novos = []
    for lid, nome, url in LEIS:
        spath = os.path.join(OUT, f'{lid}.json')
        snap = carregar(spath, None)
        if snap and len(snap.get('artigos', {})) <= 1:
            snap = None  # versão anterior inválida (ex.: página de bloqueio)
        try:
            html = baixar(url)
            if re.search(r'requisi[çc][ãa]o foi bloqueada|bloqueio\.de\.aplicacoes', html, re.I):
                raise RuntimeError('o site do Planalto bloqueou a leitura automática')
            arts = artigos(html)
            if len(arts) - (1 if 'Preâmbulo' in arts else 0) < 3:
                raise RuntimeError('página sem artigos reconhecíveis')
        except Exception as e:
            print(f'[erro] {nome}: {e}', flush=True)
            st = status.get(lid, {'id': lid, 'nome': nome, 'url': url})
            st.update({'status': f'falha ao ler: {str(e)[:80]}', 'tentativa': agora})
            status[lid] = st
            continue
        n = len(arts) - (1 if 'Preâmbulo' in arts else 0)
        if snap and n < 0.5 * max(1, len(snap.get('artigos', {})) - 1):
            print(f'[aviso] {nome}: só {n} artigos lidos (antes {len(snap["artigos"])}); ignorando esta leitura', flush=True)
            status.setdefault(lid, {'id': lid, 'nome': nome, 'url': url}).update({'status': 'leitura incompleta, mantida a versão anterior', 'tentativa': agora})
            continue
        if not snap:
            print(f'[base] {nome}: {n} artigos guardados como versão inicial', flush=True)
        else:
            mud = comparar(snap['artigos'], arts)
            if mud:
                ev = {
                    'id': f'{lid}-{int(time.time())}', 'lei': lid, 'nome': nome, 'url': url, 'detectado': agora,
                    'resumo': {t: sum(1 for x in mud if x['tipo'] == t) for t in ('alterado', 'incluido', 'revogado', 'removido')},
                    'mudancas': mud[:60], 'total': len(mud),
                }
                novos.append(ev)
                print(f'[MUDOU] {nome}: {len(mud)} artigo(s) -> ' + ', '.join(x['art'] + ' (' + x['tipo'] + ')' for x in mud[:15]), flush=True)
            else:
                print(f'[igual] {nome}: {n} artigos, sem mudanças', flush=True)
        salvar(spath, {'id': lid, 'nome': nome, 'url': url, 'verificado': agora, 'artigos': arts})
        status[lid] = {'id': lid, 'nome': nome, 'url': url, 'artigos': n, 'verificado': agora, 'status': 'ok'}
    eventos = (novos + m.get('eventos', []))[:MAX_EVENTOS]
    ordem = [x[0] for x in LEIS]
    salvar(mpath, {'verificado': agora, 'leis': sorted(status.values(), key=lambda x: ordem.index(x['id']) if x['id'] in ordem else 99), 'eventos': eventos})
    print(f'pronto: {len(novos)} mudança(s) nova(s)', flush=True)


if __name__ == '__main__':
    main()
