"""Gera os resumos de eleições passadas a partir dos Dados Abertos do TSE.

Baixa votacao_candidato_munzona_<ANO>.zip, soma os votos por candidato (por estado e,
nas municipais, por município) e grava arquivos JSON pequenos em data/historico/.
Roda no GitHub Actions (workflow "Atualizar eleições passadas").
"""
import csv, io, json, os, sys, time, urllib.request, zipfile, re
from collections import defaultdict

ANOS_GERAIS = [2014, 2018, 2022]
ANOS_MUNICIPAIS = [2016, 2020, 2024]
URL = 'https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_{}.zip'
URL_DET = 'https://cdn.tse.jus.br/estatistica/sead/odsele/detalhe_votacao_munzona/detalhe_votacao_munzona_{}.zip'
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'historico')
CARGOS = {'1': 'Presidente', '3': 'Governador', '5': 'Senador', '6': 'Deputado Federal', '7': 'Deputado Estadual',
          '8': 'Deputado Distrital', '11': 'Prefeito', '13': 'Vereador'}
MAJ = {'1', '3', '5', '11'}
csv.field_size_limit(10 ** 9)


def sit_code(s):
    s = (s or '').upper()
    if s.startswith('ELEITO'):
        return 'e'
    if '2º TURNO' in s or '2O TURNO' in s or '2° TURNO' in s:
        return '2'
    if s.startswith('SUPLENTE'):
        return 's'
    return 'n'


def download(ano, det=False):
    dest = f'/tmp/{"det" if det else "munzona"}_{ano}.zip'
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        return dest
    url = (URL_DET if det else URL).format(ano)
    print('baixando', url, flush=True)
    for tent in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 radar-politico'})
            with urllib.request.urlopen(req, timeout=600) as r, open(dest, 'wb') as f:
                while True:
                    b = r.read(1 << 20)
                    if not b:
                        break
                    f.write(b)
            print('  ok', os.path.getsize(dest) // (1 << 20), 'MB', flush=True)
            return dest
        except Exception as e:
            print('  falhou', e, flush=True)
            time.sleep(10)
    raise SystemExit('nao foi possivel baixar ' + url)


def rows(zpath):
    with zipfile.ZipFile(zpath) as z:
        names = [n for n in z.namelist() if n.lower().endswith('.csv')]
        por_uf = [n for n in names if re.search(r'_([A-Z]{2})\.csv$', n, re.I) and not re.search(r'_(BR|BRASIL)\.csv$', n, re.I)]
        usar = por_uf or names
        print('  arquivos:', len(usar), 'de', len(names), flush=True)
        for n in usar:
            with z.open(n) as raw:
                txt = io.TextIOWrapper(raw, encoding='latin-1', newline='')
                rd = csv.reader(txt, delimiter=';', quotechar='"')
                head = next(rd)
                idx = {h.strip().upper(): i for i, h in enumerate(head)}
                need = ['NR_TURNO', 'CD_CARGO', 'SG_UF', 'SQ_CANDIDATO', 'NR_CANDIDATO', 'NM_URNA_CANDIDATO', 'SG_PARTIDO']
                if any(k not in idx for k in need):
                    print('  cabecalho inesperado em', n, head[:12], flush=True)
                    continue
                iv = idx.get('QT_VOTOS_NOMINAIS_VALIDOS', idx.get('QT_VOTOS_NOMINAIS'))
                isit = idx.get('DS_SIT_TOT_TURNO')
                imun, inm = idx.get('CD_MUNICIPIO'), idx.get('NM_MUNICIPIO')
                for r in rd:
                    try:
                        v = int(r[iv] or 0)
                    except (ValueError, IndexError):
                        continue
                    yield {
                        't': r[idx['NR_TURNO']], 'c': r[idx['CD_CARGO']], 'uf': r[idx['SG_UF']].lower(),
                        'sq': r[idx['SQ_CANDIDATO']], 'n': r[idx['NR_CANDIDATO']], 'nm': r[idx['NM_URNA_CANDIDATO']],
                        'p': r[idx['SG_PARTIDO']], 'v': v, 's': sit_code(r[isit]) if isit is not None else 'n',
                        'mun': r[imun] if imun is not None else '', 'mnm': r[inm] if inm is not None else '',
                    }


def pick(idx, *names):
    for n in names:
        if n in idx:
            return idx[n]
    return None


def detalhes(ano, municipal):
    """Soma aptos, comparecimento, abstenções, válidos, brancos e nulos.
    Lista: [aptos, comparecimento, abstencoes, validos, brancos, nulos]"""
    agg = defaultdict(lambda: [0, 0, 0, 0, 0, 0])
    try:
        zpath = download(ano, det=True)
    except SystemExit as e:
        print('  sem detalhes:', e, flush=True)
        return {}
    with zipfile.ZipFile(zpath) as z:
        names = [n for n in z.namelist() if n.lower().endswith('.csv')]
        por_uf = [n for n in names if re.search(r'_([A-Z]{2})\.csv$', n, re.I) and not re.search(r'_(BR|BRASIL)\.csv$', n, re.I)]
        for n in (por_uf or names):
            with z.open(n) as raw:
                rd = csv.reader(io.TextIOWrapper(raw, encoding='latin-1', newline=''), delimiter=';', quotechar='"')
                idx = {h.strip().upper(): i for i, h in enumerate(next(rd))}
                cols = [pick(idx, 'QT_APTOS'), pick(idx, 'QT_COMPARECIMENTO'), pick(idx, 'QT_ABSTENCOES'),
                        pick(idx, 'QT_VOTOS_VALIDOS'), pick(idx, 'QT_VOTOS_BRANCOS'), pick(idx, 'QT_TOTAL_VOTOS_NULOS', 'QT_VOTOS_NULOS')]
                nom = pick(idx, 'QT_VOTOS_NOMINAIS_VALIDOS', 'QT_VOTOS_NOMINAIS')
                leg = pick(idx, 'QT_TOTAL_VOTOS_LEG_VALIDOS', 'QT_VOTOS_LEGENDA_VALIDOS', 'QT_VOTOS_LEGENDA')
                ic, it, iu, im = idx.get('CD_CARGO'), idx.get('NR_TURNO'), idx.get('SG_UF'), idx.get('CD_MUNICIPIO')
                if ic is None or it is None or iu is None:
                    print('  cabecalho de detalhes inesperado', n, flush=True)
                    continue
                for r in rd:
                    try:
                        c = r[ic]
                        if c not in CARGOS:
                            continue
                        vals = [int(r[i] or 0) if i is not None else 0 for i in cols]
                        if cols[3] is None:
                            vals[3] = (int(r[nom] or 0) if nom is not None else 0) + (int(r[leg] or 0) if leg is not None else 0)
                    except (ValueError, IndexError):
                        continue
                    uf = r[iu].lower()
                    keys = [(c, r[it], uf)]
                    if municipal and im is not None:
                        keys.append((c, r[it], uf, r[im]))
                    elif c == '1':
                        keys.append((c, r[it], 'br'))
                    for k in keys:
                        a = agg[k]
                        for i in range(6):
                            a[i] += vals[i]
    try:
        os.remove(zpath)
    except OSError:
        pass
    return agg


def put_det(target, agg, n):
    for k, v in agg.items():
        if len(k) == n:
            c, t, unit = k[0], k[1], k[-1]
            target.setdefault(c, {}).setdefault(t, {})[unit] = v


def cand_list(d):
    # d: sq -> [n, nome, partido, votos, sit]
    return sorted(d.values(), key=lambda x: -x[3])


def add(store, key, row):
    c = store[key].get(row['sq'])
    if c is None:
        store[key][row['sq']] = [row['n'], row['nm'], row['p'], row['v'], row['s']]
    else:
        c[3] += row['v']
        if row['s'] != 'n':
            c[4] = row['s']


def dump(name, obj):
    path = os.path.join(OUT, name)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    return os.path.getsize(path)


def geral(ano):
    agg = defaultdict(dict)  # (cargo, turno, uf) -> sq -> cand
    for r in rows(download(ano)):
        if r['c'] in CARGOS and r['c'] not in ('11', '13'):
            add(agg, (r['c'], r['t'], r['uf']), r)
    out = {'ano': ano, 'tipo': 'geral', 'c': {}, 'r': {}}
    cargos = defaultdict(set)
    prop = defaultdict(dict)  # uf -> cargo -> list
    for (c, t, uf), d in agg.items():
        cargos[c].add(int(t))
        lst = cand_list(d)
        if c in MAJ:
            out['c'].setdefault(c, {}).setdefault(t, {})[uf] = lst
        else:
            prop[uf][c] = lst
            out['r'].setdefault(c, {}).setdefault(t, {})[uf] = {'v': sum(x[3] for x in lst), 't': lst[0] if lst else None}
    # total do Brasil para presidente (inclui exterior)
    for t, ufs in out['c'].get('1', {}).items():
        br = {}
        for uf, lst in ufs.items():
            for x in lst:
                k = x[0] + '|' + x[2]
                if k in br:
                    br[k][3] += x[3]
                    if x[4] != 'n':
                        br[k][4] = x[4]
                else:
                    br[k] = list(x)
        ufs['br'] = sorted(br.values(), key=lambda x: -x[3])
    out['d'] = {}
    put_det(out['d'], detalhes(ano, False), 3)
    tam = dump(f'g{ano}.json', out)
    print(f'  g{ano}.json', tam // 1024, 'KB', flush=True)
    for uf, d in prop.items():
        dump(f'g{ano}-{uf}.json', d)
    return {'ano': ano, 'tipo': 'geral', 'cargos': {c: sorted(ts) for c, ts in sorted(cargos.items(), key=lambda x: int(x[0]))}}


def municipal(ano):
    agg = defaultdict(dict)  # (cargo, turno, uf, mun) -> sq -> cand
    nomes = defaultdict(dict)
    for r in rows(download(ano)):
        if r['c'] in ('11', '13'):
            add(agg, (r['c'], r['t'], r['uf'], r['mun']), r)
            nomes[r['uf']][r['mun']] = r['mnm']
    det = detalhes(ano, True)
    det_mun = defaultdict(dict)
    for k, v in det.items():
        if len(k) == 4:
            c, tt, uf, mun = k
            det_mun[uf].setdefault(c, {}).setdefault(tt, {})[mun] = v
    cargos = defaultdict(set)
    per_uf = defaultdict(lambda: {'11': {}, '13': {}})
    resumo = {'11': {}, '13': {}}
    for (c, t, uf, mun), d in agg.items():
        cargos[c].add(int(t))
        per_uf[uf][c].setdefault(t, {})[mun] = cand_list(d)
    for uf, d in per_uf.items():
        # prefeituras ganhas por partido (vencedor do turno final)
        pref = defaultdict(int)
        votos_pref = 0
        t1, t2 = d['11'].get('1', {}), d['11'].get('2', {})
        for mun, lst in t1.items():
            fin = t2.get(mun) or lst
            w = next((x for x in fin if x[4] == 'e'), None)
            if w:
                pref[w[2]] += 1
            votos_pref += sum(x[3] for x in lst)
        resumo['11'][uf] = {'v': votos_pref, 'p': dict(sorted(pref.items(), key=lambda x: -x[1])), 'm': len(t1)}
        ver = d['13'].get('1', {})
        top = None
        tot = 0
        for mun, lst in ver.items():
            tot += sum(x[3] for x in lst)
            if lst and (top is None or lst[0][3] > top[3]):
                top = lst[0] + [mun]
        resumo['13'][uf] = {'v': tot, 't': top}
        dump(f'm{ano}-{uf}.json', {'mun': nomes[uf], '11': d['11'], 'd': det_mun.get(uf, {})})
        dump(f'm{ano}-{uf}-ver.json', {'13': d['13']})
    dres = {}
    put_det(dres, det, 3)
    tam = dump(f'm{ano}.json', {'ano': ano, 'tipo': 'municipal', 'r': resumo, 'd': dres})
    print(f'  m{ano}.json', tam // 1024, 'KB', flush=True)
    return {'ano': ano, 'tipo': 'municipal', 'cargos': {c: sorted(ts) for c, ts in sorted(cargos.items(), key=lambda x: int(x[0]))}}


def main():
    os.makedirs(OUT, exist_ok=True)
    anos = [int(a) for a in sys.argv[1:]] or ANOS_GERAIS + ANOS_MUNICIPAIS
    idx_path = os.path.join(OUT, 'index.json')
    index = {}
    if os.path.exists(idx_path):
        index = {str(e['ano']): e for e in json.load(open(idx_path, encoding='utf-8'))}
    for ano in anos:
        print('== ano', ano, flush=True)
        try:
            e = geral(ano) if ano in ANOS_GERAIS or ano % 4 == 2 else municipal(ano)
        except BaseException as err:
            print('  ERRO no ano', ano, repr(err), flush=True)
            continue
        e['gerado'] = time.strftime('%d/%m/%Y')
        index[str(ano)] = e
        try:
            os.remove(f'/tmp/munzona_{ano}.zip')
        except OSError:
            pass
    lista = sorted(index.values(), key=lambda e: -e['ano'])
    dump('index.json', lista)
    print('pronto:', [e['ano'] for e in lista], flush=True)


if __name__ == '__main__':
    main()
