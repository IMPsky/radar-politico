// Fontes oficiais monitoradas pelo app.
// links    = atalhos que abrem o site oficial (sempre na versão atual).
// monitors = páginas que o app lê sozinho para detectar novidades:
//   type 'links' -> lê a página e detecta manchetes/links novos
//   type 'hash'  -> detecta qualquer alteração no texto (usado em leis)
//   type 'camara-api' -> API oficial de dados abertos da Câmara (proposições novas)

const CABO_IBGE = '2602902'; // código IBGE de Cabo de Santo Agostinho - PE

const SOURCES = [
  // ---------------- ELEIÇÕES AO VIVO ----------------
  {
    id: 'eleicoes', group: 'Eleições', icon: '🗳️', color: '#009c3b', special: 'election',
    title: 'Votação em tempo real', subtitle: 'Apuração oficial do TSE — presidente e governadores, com mapa por estado',
    desc: '', links: [], monitors: [],
  },
  {
    id: 'infopoliticos', group: 'Políticos', icon: '🗺️', color: '#002776', special: 'politicos',
    title: 'Info Políticos', subtitle: 'Mapa do Brasil por estado, cidade e bairro: quem atua em cada lugar e o que já fez',
    desc: '', links: [], monitors: [],
  },
  {
    id: 'favoritos', group: 'Favoritos', icon: '⭐', color: '#ffdf00', special: 'favorites',
    title: 'Favoritos', subtitle: 'Páginas que você salvou para acessar direto',
    desc: '', links: [], monitors: [],
  },
  // ---------------- JUSTIÇA ELEITORAL ----------------
  {
    id: 'tse', group: 'Para sua candidatura', icon: '⚖️', color: '#1f4e9c',
    title: 'TSE', subtitle: 'Tribunal Superior Eleitoral',
    desc: 'Calendário eleitoral, regras de filiação, cota de gênero, prestação de contas e sistema CANDex.',
    links: [
      { label: 'Site do TSE', url: 'https://www.tse.jus.br/' },
      { label: 'Notícias do TSE', url: 'https://www.tse.jus.br/comunicacao/noticias' },
      { label: 'Calendário eleitoral', url: 'https://www.tse.jus.br/eleicoes/calendario-eleitoral' },
      { label: 'Legislação eleitoral (resoluções)', url: 'https://www.tse.jus.br/legislacao' },
      { label: 'Prestação de contas', url: 'https://www.tse.jus.br/eleicoes/prestacao-de-contas' },
      { label: 'Sistemas eleitorais (CANDex)', url: 'https://www.tse.jus.br/eleicoes/sistemas' },
    ],
    monitors: [
      { url: 'https://www.tse.jus.br/comunicacao/noticias', type: 'links' },
      { url: 'https://www.tse.jus.br/eleicoes/calendario-eleitoral', type: 'links' },
    ],
  },
  {
    id: 'trepe', group: 'Para sua candidatura', icon: '🏛️', color: '#2a6bb8',
    title: 'TRE-PE', subtitle: 'Tribunal Regional Eleitoral de Pernambuco',
    desc: 'Domicílio eleitoral, transferência de título, certidão de quitação e zonas eleitorais do Cabo.',
    links: [
      { label: 'Site do TRE-PE', url: 'https://www.tre-pe.jus.br/' },
      { label: 'Notícias do TRE-PE', url: 'https://www.tre-pe.jus.br/comunicacao/noticias' },
      { label: 'Certidão de quitação eleitoral', url: 'https://www.tse.jus.br/servicos-eleitorais/certidoes/certidao-de-quitacao-eleitoral' },
      { label: 'Zonas eleitorais e cartórios', url: 'https://www.tre-pe.jus.br/institucional/zonas-eleitorais' },
    ],
    monitors: [
      { url: 'https://www.tre-pe.jus.br/comunicacao/noticias', type: 'links' },
    ],
  },
  {
    id: 'etitulo', group: 'Para sua candidatura', icon: '🪪', color: '#3b7dd8',
    title: 'e-Título', subtitle: 'Regularize seu título',
    desc: 'No app e-Título você regulariza sua situação eleitoral, emite certidões e consulta seu local de votação.',
    links: [
      { label: 'Baixar o e-Título (Play Store)', url: 'https://play.google.com/store/apps/details?id=br.jus.tse.eleitoral.etitulo' },
      { label: 'Autoatendimento eleitoral (Título Net)', url: 'https://www.tse.jus.br/servicos-eleitorais/autoatendimento-eleitoral' },
    ],
    monitors: [],
  },
  {
    id: 'divulgacand', group: 'Para sua candidatura', icon: '🔎', color: '#4a8fe0',
    title: 'DivulgaCand', subtitle: 'Bens e contas de candidatos',
    desc: 'Veja bens declarados e prestação de contas de qualquer candidato que já concorreu no Cabo.',
    links: [
      { label: 'Abrir DivulgaCand', url: 'https://divulgacandcontas.tse.jus.br/divulga/' },
    ],
    monitors: [],
  },

  // ---------------- LEIS E CÂMARA ----------------
  {
    id: 'camaracabo', group: 'Leis e Câmara', icon: '🏢', color: '#0f7a5a',
    title: 'Câmara do Cabo', subtitle: 'Câmara Municipal de Cabo de Santo Agostinho',
    desc: 'Pauta, projetos de lei, vereadores atuais e audiências públicas.',
    links: [
      { label: 'Site da Câmara do Cabo', url: 'https://www.cabodesantoagostinho.pe.leg.br/' },
    ],
    monitors: [
      { url: 'https://www.cabodesantoagostinho.pe.leg.br/', type: 'links' },
    ],
  },
  {
    id: 'camarafed', group: 'Leis e Câmara', icon: '🇧🇷', color: '#138a52',
    title: 'Câmara dos Deputados', subtitle: 'Projetos de lei federais',
    desc: 'Novos projetos de lei, PECs e notícias. Os projetos mais recentes vêm direto da base oficial de dados abertos.',
    links: [
      { label: 'Site da Câmara', url: 'https://www.camara.leg.br/' },
      { label: 'Notícias da Câmara', url: 'https://www.camara.leg.br/noticias' },
      { label: 'Buscar propostas', url: 'https://www.camara.leg.br/busca-portal/proposicoes/pesquisa-simplificada' },
    ],
    monitors: [
      { url: 'https://dadosabertos.camara.leg.br/api/v2/proposicoes?siglaTipo=PL,PLP,PEC&ordem=DESC&ordenarPor=id&itens=30', type: 'camara-api' },
      { url: 'https://www.camara.leg.br/noticias', type: 'links' },
    ],
  },
  {
    id: 'senado', group: 'Leis e Câmara', icon: '🏛', color: '#1a9a6c',
    title: 'Senado Federal', subtitle: 'Como uma lei federal é aprovada',
    desc: 'Notícias, votações e matérias em tramitação no Senado.',
    links: [
      { label: 'Site do Senado', url: 'https://www.senado.leg.br/' },
      { label: 'Agência Senado (notícias)', url: 'https://www12.senado.leg.br/noticias' },
      { label: 'Pesquisar matérias', url: 'https://www25.senado.leg.br/web/atividade/materias' },
    ],
    monitors: [
      { url: 'https://www12.senado.leg.br/noticias', type: 'links' },
    ],
  },
  {
    id: 'planalto', group: 'Leis e Câmara', icon: '📜', color: '#2c8f6f',
    title: 'Planalto – Legislação', subtitle: 'Constituição e leis eleitorais',
    desc: 'Textos oficiais e atualizados. As leis são conferidas artigo por artigo a cada 6 horas: se algo mudar, aparece em Nova notícia com o antes × depois e o botão Interpretação.',
    links: [
      { label: 'Constituição Federal', url: 'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm' },
      { label: 'Lei das Eleições (9.504/97)', url: 'https://www.planalto.gov.br/ccivil_03/leis/l9504.htm' },
      { label: 'Lei da Ficha Limpa (LC 135/2010)', url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp135.htm' },
      { label: 'Lei de Inelegibilidade (LC 64/90)', url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp64.htm' },
      { label: 'Lei dos Partidos (9.096/95)', url: 'https://www.planalto.gov.br/ccivil_03/leis/l9096.htm' },
      { label: 'Código Eleitoral (4.737/65)', url: 'https://www.planalto.gov.br/ccivil_03/leis/l4737compilado.htm' },
      { label: 'Portal da Legislação', url: 'https://www.planalto.gov.br/ccivil_03/' },
    ],
    // as leis são conferidas artigo por artigo a cada 6 horas (monitor no GitHub: scripts/leis.py)
    monitors: [
      { url: 'https://raw.githubusercontent.com/IMPsky/radar-politico/main/data/leis/mudancas.json', type: 'leis' },
    ],
  },

  // ---------------- DINHEIRO PÚBLICO ----------------
  {
    id: 'transparencia', group: 'Dinheiro público e transparência', icon: '💰', color: '#b7791f',
    title: 'Portal da Transparência', subtitle: 'Quanto o Cabo recebe e gasta',
    desc: 'Repasses federais, convênios e benefícios pagos no município de Cabo de Santo Agostinho.',
    links: [
      { label: 'Cabo de Santo Agostinho no Portal', url: `https://portaldatransparencia.gov.br/localidades/${CABO_IBGE}-cabo-de-santo-agostinho` },
      { label: 'Portal da Transparência', url: 'https://portaldatransparencia.gov.br/' },
    ],
    monitors: [
      { url: 'https://portaldatransparencia.gov.br/', type: 'links' },
    ],
  },
  {
    id: 'tcepe', group: 'Dinheiro público e transparência', icon: '🧾', color: '#c58a25',
    title: 'TCE-PE', subtitle: 'Tribunal de Contas de Pernambuco',
    desc: 'Contas da Prefeitura e da Câmara do Cabo — onde muita irregularidade aparece.',
    links: [
      { label: 'Site do TCE-PE', url: 'https://www.tce.pe.gov.br/' },
      { label: 'Tome Conta (painel dos municípios)', url: 'https://www.tce.pe.gov.br/internet/index.php/tome-conta' },
    ],
    monitors: [
      { url: 'https://www.tce.pe.gov.br/internet/index.php/noticias', type: 'links' },
      { url: 'https://www.tce.pe.gov.br/internet/', type: 'links' },
    ],
  },
  {
    id: 'ibge', group: 'Dinheiro público e transparência', icon: '📊', color: '#d49a33',
    title: 'IBGE e Atlas Brasil', subtitle: 'Dados reais do Cabo',
    desc: 'População, IDEB, saúde, renda e IDH — base para montar seu plano de governo.',
    links: [
      { label: 'IBGE Cidades – Cabo de Santo Agostinho', url: 'https://cidades.ibge.gov.br/brasil/pe/cabo-de-santo-agostinho/panorama' },
      { label: 'Atlas Brasil – perfil do Cabo', url: 'https://www.atlasbrasil.org.br/perfil/municipio/260290' },
      { label: 'IBGE', url: 'https://www.ibge.gov.br/' },
    ],
    monitors: [
      { url: 'https://agenciadenoticias.ibge.gov.br/agencia-noticias.html', type: 'links' },
    ],
  },

  // ---------------- PARTIDOS ----------------
  {
    id: 'filiaweb', group: 'Partidos', icon: '✅', color: '#8a3ab9',
    title: 'FiliaWeb – TSE', subtitle: 'Sua filiação está ativa?',
    desc: 'Consulte se sua filiação partidária está ativa e regular.',
    links: [
      { label: 'Consultar filiação', url: 'https://filia-consulta.tse.jus.br/' },
      { label: 'Regras de filiação partidária', url: 'https://www.tse.jus.br/partidos/filiacao-partidaria' },
    ],
    monitors: [],
  },
  {
    id: 'partidos', group: 'Partidos', icon: '🚩', color: '#9b4dca',
    title: 'Partidos', subtitle: 'Estatuto e diretório municipal',
    desc: 'Lista oficial de partidos registrados no TSE. Toque em "Meu partido" para definir o site (.org.br) do seu partido e acompanhá-lo também.',
    links: [
      { label: 'Partidos registrados no TSE', url: 'https://www.tse.jus.br/partidos/partidos-registrados-no-tse' },
    ],
    monitors: [
      { url: 'https://www.tse.jus.br/partidos/partidos-registrados-no-tse', type: 'links' },
    ],
    partyEditable: true,
  },
];

const GROUP_ORDER = ['Eleições', 'Políticos', 'Favoritos', 'Para sua candidatura', 'Leis e Câmara', 'Dinheiro público e transparência', 'Partidos', 'Meus sites'];
