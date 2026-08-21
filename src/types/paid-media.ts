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
  sql: number
  cpsql: number | null
  opportunity: number
  cpopportunity: number | null
  customer: number
  cpcustomer: number | null
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

export type ChannelBreakdownEntry = {
  leads: number
  sql: number
  opportunity: number
  customer: number
}

export type UnattributedBreakdown = {
  total: number
  totalSql: number
  totalOpportunity: number
  totalCustomer: number
  byPlatform: Partial<Record<Platform, ChannelBreakdownEntry>>
}

export type OrganicBreakdown = {
  total: number
  totalSql: number
  totalOpportunity: number
  totalCustomer: number
  byChannel: Partial<Record<OrganicChannel, ChannelBreakdownEntry>>
}

export type LeadsAttributionSummary = {
  unattributedPaid: UnattributedBreakdown
  organic: OrganicBreakdown
}

export type DealsKpi = {
  leadsTotal: number
  dealsCount: number
}

export type StageBreakdown = Record<string, number>

export type OverviewCategory = {
  total: number
  byLifecycleStage: StageBreakdown
  byDealStage: StageBreakdown
}

export type InboundOverview = {
  totalContacts: number
  active: OverviewCategory
  validated: OverviewCategory
  lost: OverviewCategory
  disqualified: OverviewCategory
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
    overview: InboundOverview | null
  }
}

export type PaidMediaErrorResponse = {
  error: string
}
