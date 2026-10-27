"""Gera a base da página "Info Políticos" a partir dos Dados Abertos do TSE.

Para cada estado grava em data/politicos/:
  <uf>.json            -> governador e deputados estaduais (mandato atual, eleitos em 2022),
                          deputados federais 2022, eleitos de 2026 (posse em 2027) e,
                          para os deputados, as cidades onde tiveram mais votos (base eleitoral)
  <uf>-mun.json        -> prefeito e vereadores eleitos em 2024 de cada cidade
  bairros/<uf>/<cod>.json -> bairros da cidade (pelos locais de votação, com latitude/longitude)
                          e os vereadores/prefeito mais votados em cada bairro (só estados em BAIRRO_UFS)
Roda no GitHub Actions (workflow "Atualizar Info Políticos").
"""
import csv, io, json, os, re, sys, time, unicodedata, urllib.request, zipfile
from collections import defaultdict

CDN = 'https://cdn.tse.jus.br/estatistica/sead/odsele'
URL_CAND = CDN + '/consulta_cand/consulta_cand_{a}.zip'
URL_MUNZONA = CDN + '/votacao_candidato_munzona/votacao_candidato_munzona_{a}.zip'
URL_SECAO = CDN + '/votacao_secao/votacao_secao_{a}_{uf}.zip'
URL_LOCAIS = CDN + '/eleitorado_locais_votacao/eleitorado_local_votacao_{a}.zip'
ELE_ID = {2022: '2040602022', 2024: '2045202024', 2026: '20322002026'}  # ids do DivulgaCand (fotos e ficha)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'politicos')
UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split()
BAIRRO_UFS = (os.environ.get('BAIRRO_UFS') or 'PE').upper().split()
csv.field_size_limit(10 ** 9)


def norm(s):
    s = unicodedata.normalize('NFD', s or '').encode('ascii', 'ignore').decode()
    return re.sub(r'[^A-Z0-9]+', ' ', s.upper()).strip()


PART = {'De', 'Da', 'Do', 'Das', 'Dos', 'E', 'Del', 'Di'}


def titulo(s):
    w = (s or '').strip().title().split()
    return ' '.join(x.lower() if i and x in PART else x for i, x in enumerate(w))


def baixar(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        return dest
    print('baixando', url, flush=True)
    for tent in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 radar-politico'})
            with urllib.request.urlopen(req, timeout=900) as r, open(dest, 'wb') as f:
                while True:
                    b = r.read(1 << 20)
                    if not b:
                        break
                    f.write(b)
            print('  ok', os.path.getsize(dest) // (1 << 20), 'MB', flush=True)
            return dest
        except Exception as e:
            print('  falhou', e, flush=True)
            if getattr(e, 'code', 0) == 404:
                return None
            time.sleep(15)
    return None


def apagar(p):
    try:
        os.remove(p)
    except (OSError, TypeError):
        pass


def ler_csv(zpath, filtro=None):
    """Percorre os CSV do zip (latin-1, ';'). filtro(nome_arquivo) escolhe os arquivos."""
    with zipfile.ZipFile(zpath) as z:
        nomes = [n for n in z.namelist() if n.lower().endswith('.csv') and (filtro is None or filtro(n))]
        for n in nomes:
            with z.open(n) as raw:
                rd = csv.reader(io.TextIOWrapper(raw, encoding='latin-1', newline=''), delimiter=';', quotechar='"')
                head = [h.strip().upper() for h in next(rd)]
                idx = {h: i for i, h in enumerate(head)}
                print('  lendo', n.split('/')[-1], '| colunas:', ','.join(head[:40]), flush=True)
                for r in rd:
                    yield idx, r


def col(idx, *nomes):
    for n in nomes:
        if n in idx:
            return idx[n]
    return None


def por_uf(n):
    m = re.search(r'_([A-Z]{2})\.csv$', n, re.I)
    return bool(m) and m.group(1).upper() not in ('BR',)


def eleitos(ano):
    """sq -> dados do candidato eleito (titulares)."""
    z = baixar(URL_CAND.format(a=ano), f'/tmp/cand_{ano}.zip')
    if not z:
        return {}
    out = {}
    for idx, r in ler_csv(z, por_uf):
        try:
            sit = r[idx['DS_SIT_TOT_TURNO']].upper()
            if not sit.startswith('ELEITO'):
                continue
            c = r[idx['CD_CARGO']]
            if c not in ('3', '5', '6', '7', '8', '11', '13'):
                continue
            g = lambda *k: (r[col(idx, *k)] if col(idx, *k) is not None else '').strip()
            sq = g('SQ_CANDIDATO')
            out[sq] = {
                'sq': sq, 'c': c, 'uf': g('SG_UF'), 'ue': g('SG_UE'), 'mn': titulo(g('NM_UE')),
                'n': titulo(g('NM_URNA_CANDIDATO')), 'nc': titulo(g('NM_CANDIDATO')), 'nr': g('NR_CANDIDATO'),
                'p': g('SG_PARTIDO'), 'oc': g('DS_OCUPACAO').capitalize(), 'gi': g('DS_GRAU_INSTRUCAO').capitalize(),
                's': 'QP' if 'QP' in sit else ('Média' if 'DIA' in sit else ''), 'a': ano,
            }
        except (KeyError, IndexError):
            continue
    print(f'  {ano}: {len(out)} eleitos', flush=True)
    apagar(z)
    return out


def votos(ano, sqs):
    """Total de votos e votos por cidade (TSE) dos candidatos em sqs."""
    z = baixar(URL_MUNZONA.format(a=ano), f'/tmp/munzona_{ano}.zip')
    tot, mun, nomes = defaultdict(int), defaultdict(lambda: defaultdict(int)), {}
    if not z:
        return tot, mun, nomes
    for idx, r in ler_csv(z, por_uf):
        try:
            sq = r[idx['SQ_CANDIDATO']]
            if sq not in sqs:
                continue
            iv = col(idx, 'QT_VOTOS_NOMINAIS_VALIDOS', 'QT_VOTOS_NOMINAIS')
            v = int(r[iv] or 0)
            if col(idx, 'NR_TURNO') is not None and r[idx['NR_TURNO']] == '2':
                tot[sq + '|2'] += v
                continue
            tot[sq] += v
            cm = r[idx['CD_MUNICIPIO']]
            mun[sq][cm] += v
            nomes[cm] = titulo(r[idx['NM_MUNICIPIO']])
        except (KeyError, IndexError, ValueError):
            continue
    apagar(z)
    return tot, mun, nomes


def item(e, tot=None, mun=None):
    d = {k: e[k] for k in ('sq', 'n', 'nc', 'nr', 'p', 'oc', 'gi', 'ue', 'a') if e.get(k)}
    if e.get('s'):
        d['s'] = e['s']
    if tot is not None:
        v = tot.get(e['sq'] + '|2') or tot.get(e['sq'])
        if v:
            d['v'] = v
    if mun is not None and mun.get(e['sq']):
        t = sum(mun[e['sq']].values()) or 1
        d['b'] = [[cm, v, round(v * 100 / t, 1)] for cm, v in sorted(mun[e['sq']].items(), key=lambda x: -x[1])[:3]]
    return d


def dump(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    return os.path.getsize(path)


def ordem(lst):
    return sorted(lst, key=lambda x: -x.get('v', 0))


def bairros(uf, el24):
    """Bairros (pelos locais de votação) e os mais votados em cada bairro, cidade por cidade."""
    zl = baixar(URL_LOCAIS.format(a=2024), '/tmp/locais_2024.zip')
    if not zl:
        return {}
    secao_bairro, info = {}, defaultdict(lambda: defaultdict(lambda: {'lat': [], 'lon': [], 'el': 0, 'loc': set()}))
    for idx, r in ler_csv(zl, lambda n: re.search(rf'_{uf}\.csv$', n, re.I) or not re.search(r'_[A-Z]{2}\.csv$', n, re.I)):
        try:
            if r[idx['SG_UF']] != uf:
                continue
            it = col(idx, 'NR_TURNO')
            if it is not None and r[it] not in ('1', ''):
                continue
            cm, z, s = r[idx['CD_MUNICIPIO']], r[idx['NR_ZONA']], r[idx['NR_SECAO']]
            b = ' '.join((r[idx['NM_BAIRRO']] or '').split()).upper()
            if not b or b in ('-', '#NULO#', 'NAO INFORMADO', 'NÃO INFORMADO'):
                continue
            secao_bairro[(cm, z, s)] = b
            d = info[cm][b]
            il, io_ = col(idx, 'NR_LATITUDE'), col(idx, 'NR_LONGITUDE')
            try:
                la, lo = float(r[il].replace(',', '.')), float(r[io_].replace(',', '.'))
                if -35 < la < 6 and -75 < lo < -28:
                    d['lat'].append(la)
                    d['lon'].append(lo)
            except (TypeError, ValueError, AttributeError):
                pass
            iq = col(idx, 'QT_ELEITOR_SECAO', 'QT_ELEITOR', 'QT_ELEITORES')
            if iq is not None:
                try:
                    d['el'] += int(r[iq] or 0)
                except ValueError:
                    pass
            il2 = col(idx, 'NR_LOCAL_VOTACAO')
            if il2 is not None:
                d['loc'].add(r[il2])
        except (KeyError, IndexError):
            continue
    print(f'  {uf}: {len(secao_bairro)} seções com bairro', flush=True)
    zs = baixar(URL_SECAO.format(a=2024, uf=uf), f'/tmp/secao_2024_{uf}.zip')
    if not zs:
        return {}
    # votos por bairro: (cm, cargo, bairro) -> numero -> votos
    vb = defaultdict(lambda: defaultdict(int))
    for idx, r in ler_csv(zs):
        try:
            c = r[idx['CD_CARGO']]
            if c not in ('11', '13') or r[idx['NR_TURNO']] != '1':
                continue
            cm = r[idx['CD_MUNICIPIO']]
            b = secao_bairro.get((cm, r[idx['NR_ZONA']], r[idx['NR_SECAO']]))
            if not b:
                continue
            nr = r[idx['NR_VOTAVEL']]
            if len(nr) < 2 or nr in ('95', '96', '97', '98'):
                continue  # brancos e nulos
            vb[(cm, c, b)][nr] += int(r[idx['QT_VOTOS']] or 0)
        except (KeyError, IndexError, ValueError):
            continue
    apagar(zs)
    # números dos eleitos por cidade
    num = defaultdict(dict)
    for e in el24.values():
        if e['uf'] == uf and e['c'] in ('11', '13'):
            num[(e['ue'], e['c'])][e['nr']] = e['sq']
    res = {}
    for cm, bs in info.items():
        lista = []
        for nm, d in sorted(bs.items()):
            x = {'nm': titulo(nm), 'el': d['el'], 'loc': len(d['loc'])}
            if d['lat']:
                x['lat'] = round(sum(d['lat']) / len(d['lat']), 5)
                x['lon'] = round(sum(d['lon']) / len(d['lon']), 5)
            for c in ('13', '11'):
                vv = vb.get((cm, c, nm))
                if not vv:
                    continue
                tot = sum(vv.values()) or 1
                top = sorted(vv.items(), key=lambda t: -t[1])
                eleitos_c = num.get((cm, c), {})
                # os 12 mais votados no bairro (marcando quem foi eleito) + todos os eleitos que tiveram voto ali
                lst = [[n, v, round(v * 100 / tot, 1), eleitos_c.get(n, '')] for n, v in top[:12]]
                ja = {t[0] for t in lst}
                lst += [[n, v, round(v * 100 / tot, 1), eleitos_c[n]] for n, v in top[12:] if n in eleitos_c and n not in ja]
                x['v' + c] = lst
                x['t' + c] = tot
            lista.append(x)
        res[cm] = lista
    return res


def main():
    os.makedirs(OUT, exist_ok=True)
    so = [u.upper() for u in sys.argv[1:]] or UFS
    el22, el24, el26 = eleitos(2022), eleitos(2024), eleitos(2026)
    sq_dep = {sq for sq, e in el22.items() if e['c'] in ('6', '7', '8', '3', '5')}
    t22, m22, nomes22 = votos(2022, sq_dep)
    sq26 = set(el26)
    t26, m26, nomes26 = votos(2026, sq26) if sq26 else ({}, {}, {})
    t24, _, _ = votos(2024, set(el24))
    index = []
    gov_path = os.path.join(OUT, 'governadores.json')
    try:
        govs = json.load(open(gov_path, encoding='utf-8'))
    except Exception:
        govs = {}
    for uf in so:
        est = {'uf': uf, 'gerado': time.strftime('%d/%m/%Y'), 'ele': ELE_ID, 'mun': {}}
        for nome, base, tot, mun in (('m22', el22, t22, m22), ('e26', el26, t26, m26)):
            grupo = defaultdict(list)
            for e in base.values():
                if e['uf'] == uf:
                    grupo[e['c']].append(item(e, tot, mun))
            est[nome] = {c: ordem(l) for c, l in grupo.items()}
        nomes = dict(nomes22)
        nomes.update(nomes26)
        cods = {b[0] for g in ('m22', 'e26') for l in est[g].values() for x in l for b in x.get('b', [])}
        est['mun'] = {c: nomes.get(c, '') for c in cods}
        tam = dump(os.path.join(OUT, f'{uf.lower()}.json'), est)
        govs[uf] = {g: est[g]['3'][0] for g in ('m22', 'e26') if est[g].get('3')}
        mun = defaultdict(lambda: {'nm': '', '11': [], '13': []})
        for e in el24.values():
            if e['uf'] == uf and e['c'] in ('11', '13'):
                m = mun[e['ue']]
                m['nm'] = e['mn']
                m[e['c']].append(item(e, t24))
        for m in mun.values():
            m['11'] = ordem(m['11'])
            m['13'] = ordem(m['13'])
        tam2 = dump(os.path.join(OUT, f'{uf.lower()}-mun.json'), {'uf': uf, 'ano': 2024, 'ele': ELE_ID[2024], 'mun': mun})
        nb = 0
        if uf in BAIRRO_UFS:
            try:
                bs = bairros(uf, el24)
                for cm, lista in bs.items():
                    dump(os.path.join(OUT, 'bairros', uf.lower(), f'{cm}.json'), {'mun': cm, 'bairros': lista})
                nb = len(bs)
            except Exception as e:
                print('  ERRO nos bairros de', uf, repr(e), flush=True)
        print(f'{uf}: estado {tam // 1024} KB, cidades {tam2 // 1024} KB ({len(mun)}), bairros em {nb} cidades', flush=True)
        index.append({'uf': uf, 'cidades': len(mun), 'bairros': nb})
    dump(gov_path, govs)
    idx_path = os.path.join(OUT, 'index.json')
    antigo = {}
    try:
        antigo = {x['uf']: x for x in json.load(open(idx_path, encoding='utf-8'))['ufs']}
    except Exception:
        pass
    for x in index:
        if x['bairros'] == 0 and antigo.get(x['uf'], {}).get('bairros'):
            x['bairros'] = antigo[x['uf']]['bairros']
        antigo[x['uf']] = x
    dump(idx_path, {'gerado': time.strftime('%d/%m/%Y'), 'bairroUfs': sorted(u for u, x in antigo.items() if x.get('bairros')), 'ufs': sorted(antigo.values(), key=lambda x: x['uf'])})
    for p in ('/tmp/locais_2024.zip',):
        apagar(p)
    print('pronto', flush=True)


if __name__ == '__main__':
    main()
