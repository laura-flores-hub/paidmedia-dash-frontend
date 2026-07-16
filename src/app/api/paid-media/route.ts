import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import type { Platform, RawSpendRow, CampaignSummary, GeoOptions } from '@/types/paid-media'

const PLATFORMS: Platform[] = ['google', 'meta', 'linkedin']
const PAGE_SIZE = 1000

function currencyKey(platform: string, adAccountId: string) {
  return `${platform.toLowerCase()}::${adAccountId.toLowerCase()}`
}

// The Supabase JS client caps unrestricted selects at a server-side default
// (1000 rows) — without paging, tables/views larger than that are silently
// truncated. Every full-table read in this route must go through this.
async function fetchAllRows<T>(
  buildQuery: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> },
  errorContext: string
): Promise<T[]> {
  const all: T[] = []
  let from = 0

  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`Falha ao consultar ${errorContext} no Supabase: ${error.message}`)

    const rows = data ?? []
    all.push(...rows)

    if (rows.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return all
}

async function fetchCurrencyMap(): Promise<Map<string, string>> {
  const supabase = getSupabaseClient()
  const data = await fetchAllRows<{ platform: string; ad_account_id: string; currency: string }>(
    () => supabase.from('static_rules_geo_validation_ads_accounts').select('platform, ad_account_id, currency'),
    'static_rules_geo_validation_ads_accounts'
  )

  const map = new Map<string, string>()
  for (const row of data) {
    map.set(currencyKey(row.platform, row.ad_account_id), row.currency)
  }
  return map
}

type GeoEntry = { region: string | null; countries: Set<string> }

const GEO_CHUNK_SIZE = 150
// The anon role appears to be capped on concurrent statements against this
// view — firing more than ~5 chunk queries at once starts producing
// "canceling statement due to statement timeout" errors even though each
// individual chunk is cheap. Keep a small worker pool instead of
// Promise.all-ing every chunk at once.
const GEO_CONCURRENCY = 4

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

async function runWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0

  async function runNext(): Promise<void> {
    while (next < items.length) {
      const index = next++
      results[index] = await worker(items[index])
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runNext))
  return results
}

type GeoRow = { campaign_id: string; region_consolidated: string | null; country_code: string | null }

async function fetchGeoChunk(
  supabase: ReturnType<typeof getSupabaseClient>,
  ids: string[],
  attempt = 1
): Promise<GeoRow[]> {
  const { data, error } = await supabase
    .from('validation_geo_campaigns_country_bridge_v2')
    .select('campaign_id, region_consolidated, country_code')
    .in('campaign_id', ids)

  if (error) {
    if (attempt < 3) return fetchGeoChunk(supabase, ids, attempt + 1)
    throw new Error(`Falha ao consultar validation_geo_campaigns_country_bridge_v2 no Supabase: ${error.message}`)
  }

  return data ?? []
}

// validation_geo_campaigns_country_bridge_v2 is a computed view — a plain
// unfiltered select (or any OFFSET-based pagination over it) blows the
// statement timeout well before reaching the end of the table. An indexed
// `campaign_id IN (...)` filter stays fast, so we only ever look up the
// campaigns that actually appear in the spend data for this request.
async function fetchGeoBridge(campaignIds: string[]): Promise<{
  byCampaign: Map<string, GeoEntry>
  geoOptions: GeoOptions
}> {
  const byCampaign = new Map<string, GeoEntry>()
  const regions = new Set<string>()
  const countriesByRegion: Record<string, Set<string>> = {}

  if (campaignIds.length === 0) {
    return { byCampaign, geoOptions: { regions: [], countriesByRegion: {} } }
  }

  const supabase = getSupabaseClient()
  const chunks = chunk(campaignIds, GEO_CHUNK_SIZE)

  const results = await runWithConcurrency(chunks, GEO_CONCURRENCY, (ids) => fetchGeoChunk(supabase, ids))
  const data: GeoRow[] = results.flat()

  for (const row of data) {
    const campaignId: string = row.campaign_id
    const region: string | null = row.region_consolidated ?? null
    const country: string | null = row.country_code ?? null

    let entry = byCampaign.get(campaignId)
    if (!entry) {
      entry = { region, countries: new Set() }
      byCampaign.set(campaignId, entry)
    } else if (region !== null && entry.region !== null && entry.region !== region) {
      console.warn(
        `validation_geo_campaigns_country_bridge_v2: campaign_id ${campaignId} tem region_consolidated inconsistente ("${entry.region}" vs "${region}"). Mantendo o primeiro valor encontrado.`
      )
    } else if (entry.region === null && region !== null) {
      entry.region = region
    }

    if (country) entry.countries.add(country)

    if (region) {
      regions.add(region)
      if (!countriesByRegion[region]) countriesByRegion[region] = new Set()
      if (country) countriesByRegion[region].add(country)
    }
  }

  const geoOptions: GeoOptions = {
    regions: [...regions].sort(),
    countriesByRegion: Object.fromEntries(
      Object.entries(countriesByRegion).map(([region, countries]) => [
        region,
        [...countries].sort(),
      ])
    ),
  }

  return { byCampaign, geoOptions }
}

async function fetchGoogle(from: string | null, to: string | null): Promise<RawSpendRow[]> {
  const supabase = getSupabaseClient()
  const data = await fetchAllRows<{
    campaign_id: string
    campaign_name: string
    spend: number
    ad_account_id: string
  }>(() => {
    let query = supabase.from('data_google_v2').select('campaign_id, campaign_name, spend, date, ad_account_id')
    if (from) query = query.gte('date', from)
    if (to) query = query.lte('date', to)
    return query
  }, 'data_google_v2')

  return data.map((row) => ({
    platform: 'google' as const,
    campaign_id: row.campaign_id,
    campaign_name: row.campaign_name,
    ad_account_id: row.ad_account_id,
    spend: row.spend,
  }))
}

async function fetchMeta(from: string | null, to: string | null): Promise<RawSpendRow[]> {
  const supabase = getSupabaseClient()
  const data = await fetchAllRows<{
    campaign_id: string
    campaign_name: string
    cost: number
    ad_account_id: string
  }>(() => {
    let query = supabase.from('data_meta_v2').select('campaign_id, campaign_name, cost, date_start, ad_account_id')
    if (from) query = query.gte('date_start', from)
    if (to) query = query.lte('date_start', to)
    return query
  }, 'data_meta_v2')

  return data.map((row) => ({
    platform: 'meta' as const,
    campaign_id: row.campaign_id,
    campaign_name: row.campaign_name,
    ad_account_id: row.ad_account_id,
    spend: row.cost,
  }))
}

async function fetchLinkedin(from: string | null, to: string | null): Promise<RawSpendRow[]> {
  const supabase = getSupabaseClient()
  const data = await fetchAllRows<{
    campaign_id: string
    campaign_name: string
    cost: number
    ad_account_id: string
  }>(() => {
    let query = supabase.from('data_linkedin_v2').select('campaign_id, campaign_name, cost, date_start, ad_account_id')
    if (from) query = query.gte('date_start', from)
    if (to) query = query.lte('date_start', to)
    return query
  }, 'data_linkedin_v2')

  return data.map((row) => ({
    platform: 'linkedin' as const,
    campaign_id: row.campaign_id,
    campaign_name: row.campaign_name,
    ad_account_id: row.ad_account_id,
    spend: row.cost,
  }))
}

const FETCHERS: Record<Platform, typeof fetchGoogle> = {
  google: fetchGoogle,
  meta: fetchMeta,
  linkedin: fetchLinkedin,
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const platformParam = searchParams.get('platform')
  const regionParam = searchParams.get('region')
  const countryParam = searchParams.get('country')

  if (platformParam && !PLATFORMS.includes(platformParam as Platform)) {
    return NextResponse.json(
      { error: `Parâmetro "platform" inválido: "${platformParam}". Use google, meta ou linkedin.` },
      { status: 400 }
    )
  }

  const platformsToFetch: Platform[] = platformParam ? [platformParam as Platform] : PLATFORMS

  try {
    const [spendResults, currencyMap] = await Promise.all([
      Promise.all(platformsToFetch.map((platform) => FETCHERS[platform](from, to))),
      fetchCurrencyMap(),
    ])
    const rawRows = spendResults.flat()
    const campaignIds = [...new Set(rawRows.map((row) => row.campaign_id))]
    const geo = await fetchGeoBridge(campaignIds)

    const missingCurrency = new Set<string>()
    for (const row of rawRows) {
      if (!currencyMap.has(currencyKey(row.platform, row.ad_account_id))) {
        missingCurrency.add(`platform=${row.platform}, ad_account_id=${row.ad_account_id}`)
      }
    }

    if (missingCurrency.size > 0) {
      return NextResponse.json(
        {
          error: `ad_account_id sem moeda mapeada em static_rules_geo_validation_ads_accounts: ${[...missingCurrency].join('; ')}`,
        },
        { status: 502 }
      )
    }

    const aggregated = new Map<string, CampaignSummary>()
    for (const row of rawRows) {
      const currency = currencyMap.get(currencyKey(row.platform, row.ad_account_id))!
      const key = `${row.campaign_id}::${currency}`

      const existing = aggregated.get(key)
      if (existing) {
        existing.spend += row.spend
      } else {
        const geoEntry = geo.byCampaign.get(row.campaign_id)
        aggregated.set(key, {
          campaign_id: row.campaign_id,
          campaign_name: row.campaign_name,
          platform: row.platform,
          ad_account_id: row.ad_account_id,
          currency,
          spend: row.spend,
          region: geoEntry?.region ?? null,
          countries: geoEntry ? [...geoEntry.countries] : [],
        })
      }
    }

    let data = [...aggregated.values()]

    if (regionParam) {
      data = data.filter((row) => row.region === regionParam)
    }
    if (countryParam) {
      data = data.filter((row) => row.countries.includes(countryParam))
    }

    return NextResponse.json({
      data,
      meta: {
        from: from ?? null,
        to: to ?? null,
        platform: platformParam ? (platformParam as Platform) : 'all',
        region: regionParam ?? null,
        country: countryParam ?? null,
        count: data.length,
        geoOptions: geo.geoOptions,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro desconhecido ao consultar o Supabase.' },
      { status: 502 }
    )
  }
}
