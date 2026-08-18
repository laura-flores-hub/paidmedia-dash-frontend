export type Platform = 'google' | 'meta' | 'linkedin'

export type RawSpendRow = {
  platform: Platform
  campaign_id: string
  campaign_name: string
  ad_account_id: string
  spend: number
}

export type CampaignSummary = {
  campaign_id: string
  campaign_name: string
  platform: Platform
  ad_account_id: string
  currency: string
  spend: number
  region: string | null
  countries: string[]
  leads: number
  cpl: number | null
}

export type GeoOptions = {
  regions: string[]
  countriesByRegion: Record<string, string[]>
}

export type OrganicChannel =
  | 'email'
  | 'agentes_ia'
  | 'busca_organica'
  | 'referral'
  | 'social_media'
  | 'trafego_direto'
  | 'outros'

export type UnattributedBreakdown = {
  total: number
  byPlatform: Partial<Record<Platform, number>>
}

export type OrganicBreakdown = {
  total: number
  byChannel: Partial<Record<OrganicChannel, number>>
}

export type LeadsAttributionSummary = {
  unattributedPaid: UnattributedBreakdown
  organic: OrganicBreakdown
}

export type DealsKpi = {
  leadsTotal: number
  validatedDeals: number
}

export type PaidMediaResponse = {
  data: CampaignSummary[]
  meta: {
    from: string | null
    to: string | null
    platform: Platform | 'all'
    region: string | null
    country: string | null
    count: number
    geoOptions: GeoOptions
    leadsAttribution: LeadsAttributionSummary
    kpis: DealsKpi
  }
}

export type PaidMediaErrorResponse = {
  error: string
}
