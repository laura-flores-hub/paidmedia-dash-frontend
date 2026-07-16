export type Language = 'pt' | 'en' | 'es'

export const LANGUAGES: Language[] = ['pt', 'en', 'es']

const dict = {
  'filters.dateFrom': { pt: 'De', en: 'From', es: 'Desde' },
  'filters.dateTo': { pt: 'Até', en: 'To', es: 'Hasta' },
  'filters.platform': { pt: 'Plataforma', en: 'Platform', es: 'Plataforma' },
  'filters.platform.all': { pt: 'Todas', en: 'All', es: 'Todas' },
  'filters.region': { pt: 'Região', en: 'Region', es: 'Región' },
  'filters.region.all': { pt: 'Todas', en: 'All', es: 'Todas' },
  'filters.country': { pt: 'País', en: 'Country', es: 'País' },
  'filters.country.all': { pt: 'Todos', en: 'All', es: 'Todos' },
  'summary.totalUsd': { pt: 'Total USD', en: 'Total USD', es: 'Total USD' },
  'summary.totalArs': { pt: 'Total ARS', en: 'Total ARS', es: 'Total ARS' },
  'table.platform': { pt: 'Plataforma', en: 'Platform', es: 'Plataforma' },
  'table.campaign': { pt: 'Campanha', en: 'Campaign', es: 'Campaña' },
  'table.currency': { pt: 'Moeda', en: 'Currency', es: 'Moneda' },
  'table.spend': { pt: 'Spend', en: 'Spend', es: 'Gasto' },
  'table.region': { pt: 'Região', en: 'Region', es: 'Región' },
  'table.countries': { pt: 'Países', en: 'Countries', es: 'Países' },
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
  'page.title': { pt: 'Dashboard de Paid Media', en: 'Paid Media Dashboard', es: 'Dashboard de Paid Media' },
} satisfies Record<string, Record<Language, string>>

export type TranslationKey = keyof typeof dict

export function translate(lang: Language, key: TranslationKey): string {
  return dict[key][lang]
}
