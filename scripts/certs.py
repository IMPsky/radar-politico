"""Verifica os certificados HTTPS dos sites usados pelo app.

Alguns sites do governo não enviam a cadeia completa do certificado. Navegadores de
computador completam sozinhos, mas o Android recusa a conexão ("sem conexão com o site").
Este script, rodando na compilação, baixa os certificados intermediários que faltam e
configura o app para confiar neles (além dos certificados normais do sistema).
"""
import os, re, ssl, socket, subprocess, urllib.request, tempfile

HOSTS = [
    'www.tce.pe.gov.br', 'portaldatransparencia.gov.br', 'www.tse.jus.br', 'www.tre-pe.jus.br',
    'www.cabodesantoagostinho.pe.leg.br', 'www.camara.leg.br', 'dadosabertos.camara.leg.br',
    'www12.senado.leg.br', 'www.planalto.gov.br', 'agenciadenoticias.ibge.gov.br',
    'resultados.tse.jus.br', 'raw.githubusercontent.com',
]
RES = 'android/app/src/main/res'
MANIFEST = 'android/app/src/main/AndroidManifest.xml'


def ok(host, cafile=None):
    ctx = ssl.create_default_context()
    if cafile:
        ctx.load_verify_locations(cafile)
    try:
        with socket.create_connection((host, 443), timeout=20) as s:
            with ctx.wrap_socket(s, server_hostname=host):
                return True, ''
    except Exception as e:
        return False, str(e)


def server_chain(host):
    out = subprocess.run(['openssl', 's_client', '-connect', f'{host}:443', '-servername', host, '-showcerts'],
                         input=b'', capture_output=True, timeout=40).stdout.decode('latin-1')
    return re.findall(r'-----BEGIN CERTIFICATE-----.+?-----END CERTIFICATE-----', out, re.S)


def aia_url(pem):
    with tempfile.NamedTemporaryFile('w', suffix='.pem', delete=False) as f:
        f.write(pem)
    txt = subprocess.run(['openssl', 'x509', '-in', f.name, '-noout', '-text'], capture_output=True).stdout.decode('latin-1')
    m = re.search(r'CA Issuers - URI:(\S+)', txt)
    return m.group(1) if m else None


def fetch_cert(url):
    data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=30).read()
    if b'BEGIN CERTIFICATE' in data:
        return re.findall(r'-----BEGIN CERTIFICATE-----.+?-----END CERTIFICATE-----', data.decode('latin-1'), re.S)
    with tempfile.NamedTemporaryFile(delete=False) as f:
        f.write(data)
    for args in (['openssl', 'x509', '-inform', 'DER', '-in', f.name], ['openssl', 'pkcs7', '-inform', 'DER', '-in', f.name, '-print_certs']):
        r = subprocess.run(args, capture_output=True)
        pems = re.findall(r'-----BEGIN CERTIFICATE-----.+?-----END CERTIFICATE-----', r.stdout.decode('latin-1'), re.S)
        if pems:
            return pems
    return []


def main():
    extra = []
    for host in HOSTS:
        good, err = ok(host)
        if good:
            print(f'[ok] {host}')
            continue
        print(f'[falha] {host}: {err}')
        try:
            chain = server_chain(host)
        except Exception as e:
            print('   nao foi possivel ler a cadeia:', e)
            continue
        if not chain:
            print('   servidor nao enviou certificados')
            continue
        cur = chain[-1]
        found = []
        for _ in range(4):
            url = aia_url(cur)
            if not url:
                break
            try:
                certs = fetch_cert(url)
            except Exception as e:
                print('   falha ao baixar', url, e)
                break
            if not certs:
                break
            found.extend(certs)
            cur = certs[0]
            with tempfile.NamedTemporaryFile('w', suffix='.pem', delete=False) as f:
                f.write('\n'.join(extra + found))
            good, err = ok(host, f.name)
            if good:
                break
        good, err = ok(host, f.name) if found else (False, 'sem certificados extras')
        print('   corrigido' if good else f'   ainda falha: {err}', f'({len(found)} certificado(s) baixado(s))')
        if found:
            extra.extend(c for c in found if c not in extra)
    if not extra:
        print('Nenhum certificado extra necessario.')
        return
    os.makedirs(f'{RES}/raw', exist_ok=True)
    os.makedirs(f'{RES}/xml', exist_ok=True)
    anchors = []
    for i, pem in enumerate(extra):
        open(f'{RES}/raw/extra_ca_{i}.pem', 'w').write(pem + '\n')
        anchors.append(f'      <certificates src="@raw/extra_ca_{i}" />')
    open(f'{RES}/xml/network_security_config.xml', 'w').write(
        '<?xml version="1.0" encoding="utf-8"?>\n<network-security-config>\n  <base-config cleartextTrafficPermitted="false">\n'
        '    <trust-anchors>\n      <certificates src="system" />\n' + '\n'.join(anchors) + '\n    </trust-anchors>\n  </base-config>\n</network-security-config>\n')
    m = open(MANIFEST).read()
    if 'networkSecurityConfig' not in m:
        m = m.replace('<application', '<application\n        android:networkSecurityConfig="@xml/network_security_config"', 1)
        open(MANIFEST, 'w').write(m)
    print(f'{len(extra)} certificado(s) extra(s) incluidos no app.')


if __name__ == '__main__':
    main()
