export type Language = 'pt' | 'en' | 'es'

export const LANGUAGES: Language[] = ['pt', 'en', 'es']

const dict = {
  'filters.dateFrom': { pt: 'De', en: 'From', es: 'Desde' },
  'filters.dateTo': { pt: 'Até', en: 'To', es: 'Hasta' },
  'filters.platform': { pt: 'View', en: 'View', es: 'View' },
  'filters.platform.all': { pt: 'Overview', en: 'Overview', es: 'Overview' },
  'filters.platform.other': { pt: 'Other', en: 'Other', es: 'Other' },
  'filters.country': { pt: 'País', en: 'Country', es: 'País' },
  'filters.country.all': { pt: 'Todos', en: 'All', es: 'Todos' },
  'summary.totalSpend': { pt: 'Total investido', en: 'Total spend', es: 'Total invertido' },
  'summary.leads': { pt: 'Volume de leads', en: 'Lead volume', es: 'Volumen de leads' },
  'summary.cplAvg': { pt: 'CPL médio', en: 'Avg. CPL', es: 'CPL promedio' },
  'summary.validatedDeals': { pt: 'Deals validados', en: 'Validated deals', es: 'Deals validados' },
  'summary.validationRate': {
    pt: 'Taxa de validação média',
    en: 'Avg. validation rate',
    es: 'Tasa de validación promedio',
  },
  'table.platform': { pt: 'Plataforma', en: 'Platform', es: 'Plataforma' },
  'table.campaign': { pt: 'Campanha', en: 'Campaign', es: 'Campaña' },
  'table.currency': { pt: 'Moeda', en: 'Currency', es: 'Moneda' },
  'table.spend': { pt: 'Spend', en: 'Spend', es: 'Gasto' },
  'table.empty': {
    pt: 'Nenhum dado encontrado para os filtros selecionados.',
    en: 'No data found for the selected filters.',
    es: 'No se encontraron datos para los filtros seleccionados.',
  },
  'state.loading': { pt: 'Carregando...', en: 'Loading...', es: 'Cargando...' },
  'errors.loadFailed': {
    pt: 'Erro ao carregar dados:',
    en: 'Error loading data:',
    es: 'Error al cargar los datos:',
  },
  'page.title': { pt: 'Inbound Dashboard', en: 'Inbound Dashboard', es: 'Inbound Dashboard' },
  'table.leads': { pt: 'Leads', en: 'Leads', es: 'Leads' },
  'table.cpl': { pt: 'CPL', en: 'CPL', es: 'CPL' },
  'table.sql': { pt: 'SQL', en: 'SQL', es: 'SQL' },
  'table.cpsql': { pt: 'CPSQL', en: 'CPSQL', es: 'CPSQL' },
  'table.opportunity': { pt: 'Opp', en: 'Opp', es: 'Opp' },
  'table.cpopportunity': { pt: 'CP Opp', en: 'CP Opp', es: 'CP Opp' },
  'table.customer': { pt: 'Won', en: 'Won', es: 'Won' },
  'table.cpcustomer': { pt: 'CP Won', en: 'CP Won', es: 'CP Won' },
  'leadsAttribution.title': {
    pt: 'Leads sem atribuição de campanha',
    en: 'Leads without campaign attribution',
    es: 'Leads sin atribución de campaña',
  },
  'leadsAttribution.category': { pt: 'Categoria', en: 'Category', es: 'Categoría' },
  'leadsAttribution.leads': { pt: 'Leads', en: 'Leads', es: 'Leads' },
  'leadsAttribution.sql': { pt: 'SQL', en: 'SQL', es: 'SQL' },
  'leadsAttribution.opportunity': { pt: 'Opp', en: 'Opp', es: 'Opp' },
  'leadsAttribution.customer': { pt: 'Won', en: 'Won', es: 'Won' },
  'leadsAttribution.unattributedPaid': {
    pt: 'Leads pagos sem atribuição a campanha',
    en: 'Paid leads without campaign attribution',
    es: 'Leads pagos sin atribución a campaña',
  },
  'leadsAttribution.organic': { pt: 'Canais orgânicos', en: 'Organic channels', es: 'Canales orgánicos' },
  'leadsAttribution.empty': {
    pt: 'Nenhum lead nessa categoria para os filtros selecionados.',
    en: 'No leads in this category for the selected filters.',
    es: 'Ningún lead en esta categoría para los filtros seleccionados.',
  },
  'channel.email': { pt: 'Email', en: 'Email', es: 'Email' },
  'channel.agentes_ia': { pt: 'Agentes de IA', en: 'AI agents', es: 'Agentes de IA' },
  'channel.busca_organica': { pt: 'Busca orgânica', en: 'Organic search', es: 'Búsqueda orgánica' },
  'channel.referral': { pt: 'Referral', en: 'Referral', es: 'Referral' },
  'channel.social_media': { pt: 'Social media', en: 'Social media', es: 'Social media' },
  'channel.trafego_direto': { pt: 'Tráfego direto', en: 'Direct traffic', es: 'Tráfico directo' },
  'channel.outros': { pt: 'Outros', en: 'Other', es: 'Otros' },
  'overview.totalContacts': {
    pt: 'Volume geral de leads (contatos)',
    en: 'Overall lead volume (contacts)',
    es: 'Volumen general de leads (contactos)',
  },
  'overview.active': { pt: 'Leads ativos', en: 'Active leads', es: 'Leads activos' },
  'overview.validated': { pt: 'Leads validados', en: 'Validated leads', es: 'Leads validados' },
  'overview.lost': { pt: 'Leads perdidos', en: 'Lost leads', es: 'Leads perdidos' },
  'overview.disqualified': { pt: 'Desqualificados', en: 'Disqualified', es: 'Descalificados' },
  'overview.byLifecycleStage': { pt: 'Por tipo de contato', en: 'By contact type', es: 'Por tipo de contacto' },
  'overview.byDealStage': { pt: 'Por deal stage', en: 'By deal stage', es: 'Por deal stage' },
} satisfies Record<string, Record<Language, string>>

export type TranslationKey = keyof typeof dict

export function translate(lang: Language, key: TranslationKey): string {
  return dict[key][lang]
}
