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
}

export type GeoOptions = {
  regions: string[]
  countriesByRegion: Record<string, string[]>
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
  }
}

export type PaidMediaErrorResponse = {
  error: string
}
