export type Platform = 'google' | 'meta' | 'linkedin'

export type PaidMediaRow = {
  platform: Platform
  campaign_id: string
  campaign_name: string
  ad_account_id: string
  spend: number
  date: string
}

export type PaidMediaResponse = {
  data: PaidMediaRow[]
  meta: {
    from: string | null
    to: string | null
    platform: Platform | 'all'
    count: number
  }
}

export type PaidMediaErrorResponse = {
  error: string
}
