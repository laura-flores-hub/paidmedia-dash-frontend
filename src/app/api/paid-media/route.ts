import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import type {
  Platform,
  RawSpendRow,
  CampaignSummary,
  GeoOptions,
  OrganicChannel,
  LeadsAttributionSummary,
  ChannelBreakdownEntry,
  InboundOverview,
  OverviewCategory,
  StageBreakdown,
} from '@/types/paid-media'

const PLATFORMS: Platform[] = ['google', 'meta', 'linkedin']
const PAGE_SIZE = 1000
// How long a given query result stays served from cache before Supabase is
// hit again. This is what actually fixes the slowness — previously every
// request re-ran the full paginated reads below with no caching layer at
// all. A plain in-memory cache is used (rather than Next's unstable_cache)
// because the raw rows fetched here can exceed unstable_cache's 2MB per-entry
// limit as the underlying tables grow.
const CACHE_TTL_MS = 5 * 60 * 1000

const memoryCache = new Map<string, { data: unknown; expiresAt: number }>()

async function withCache<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = memoryCache.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.data as T

  const data = await fetcher()
  memoryCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
  return data
}

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

async function fetchCurrencyRows(): Promise<{ platform: string; ad_account_id: string; currency: string }[]> {
  const supabase = getSupabaseClient()
  return fetchAllRows<{ platform: string; ad_account_id: string; currency: string }>(
    () => supabase.from('static_rules_geo_validation_ads_accounts').select('platform, ad_account_id, currency'),
    'static_rules_geo_validation_ads_accounts'
  )
}

async function fetchCurrencyMap(): Promise<Map<string, string>> {
  const data = await withCache('currency-rows', fetchCurrencyRows)
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
async function fetchGeoRows(campaignIds: string[]): Promise<GeoRow[]> {
  if (campaignIds.length === 0) return []

  const supabase = getSupabaseClient()
  const chunks = chunk(campaignIds, GEO_CHUNK_SIZE)

  const results = await runWithConcurrency(chunks, GEO_CONCURRENCY, (ids) => fetchGeoChunk(supabase, ids))
  return results.flat()
}

function buildGeoBridge(data: GeoRow[]): {
  byCampaign: Map<string, GeoEntry>
  geoOptions: GeoOptions
} {
  const byCampaign = new Map<string, GeoEntry>()
  const regions = new Set<string>()
  const countriesByRegion: Record<string, Set<string>> = {}

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

async function fetchGeoBridge(campaignIds: string[]): Promise<{
  byCampaign: Map<string, GeoEntry>
  geoOptions: GeoOptions
}> {
  const sortedIds = [...campaignIds].sort()
  const data = await withCache(`geo-rows::${sortedIds.join(',')}`, () => fetchGeoRows(sortedIds))
  return buildGeoBridge(data)
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

function normalize(value: string | null | undefined): string {
  const raw = value ?? ''
  // Campaign names arriving via UTM params are URL-encoded (e.g. "%2B",
  // "%5B") — without decoding, a name-based lookup never matches the plain
  // campaign_name stored in validation_ads_campaign_keys_v2.
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    // Malformed encoding — fall back to the raw value rather than throwing.
  }
  return decoded.trim().toLowerCase()
}

// Maps a HubSpot form's utm_source to one of the ad platforms this dashboard
// tracks. Anything else (email, AI agents, referrals, ...) is organic.
function platformFromUtmSource(utmSource: string | null): Platform | null {
  const s = normalize(utmSource)
  if (['facebook', 'meta', 'instagram'].includes(s)) return 'meta'
  if (s === 'linkedin') return 'linkedin'
  if (['google', 'adwords', 'youtube'].includes(s)) return 'google'
  return null
}

function hostnameOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

function classifyOrganicChannel(utmSource: string | null, referrer: string | null): OrganicChannel {
  const s = normalize(utmSource)

  if (s === 'hs_email') return 'email'
  if (s === 'chatgpt.com' || s === 'copilot.com') return 'agentes_ia'
  if (s === 'hs_automation' || s === 'th' || s === 'jotform' || s === 'ooh') return 'outros'

  if (!s) {
    const host = hostnameOf(referrer)
    if (!host) return 'trafego_direto'
    if (/(^|\.)(google|bing|duckduckgo)\./.test(host)) return 'busca_organica'
    if (/(^|\.)(facebook|instagram|linkedin|twitter|x|tiktok)\./.test(host)) return 'social_media'
    return 'referral'
  }

  return 'outros'
}

type LeadFormRow = {
  contact_id: string | null
  forms_hs_utm_source: string | null
  forms_hs_utm_campaign: string | null
  forms_hsa_cam: string | null
  forms_hs_referrer: string | null
}

async function fetchLeadFormRows(from: string | null, to: string | null): Promise<LeadFormRow[]> {
  const supabase = getSupabaseClient()
  return fetchAllRows<LeadFormRow>(() => {
    let query = supabase
      .from('data_hs_forms_conversions_consolidated_v1')
      .select('contact_id, forms_hs_utm_source, forms_hs_utm_campaign, forms_hsa_cam, forms_hs_referrer, submitted_at')
    if (from) query = query.gte('submitted_at', from)
    if (to) query = query.lte('submitted_at', to)
    return query
  }, 'data_hs_forms_conversions_consolidated_v1')
}

type CampaignKeyRow = { platform: string; campaign_name: string; campaign_id: string }

async function fetchCampaignKeyRows(): Promise<CampaignKeyRow[]> {
  const supabase = getSupabaseClient()
  return fetchAllRows<CampaignKeyRow>(
    () => supabase.from('validation_ads_campaign_keys_v2').select('platform, campaign_name, campaign_id'),
    'validation_ads_campaign_keys_v2'
  )
}

function campaignKeyLookupKey(platform: Platform, campaignName: string): string {
  return `${platform}::${normalize(campaignName)}`
}

// A deal's meeting can get validated long after the underlying lead was
// submitted (weeks/months, in practice) — restricting contact→campaign
// resolution to the currently selected date window meant most validated
// deals could never be traced back to a campaign, since their lead fell
// outside that window. This resolves every contact's campaign from the
// full lead history instead, independent of any date filter, specifically
// for that lookup (lead/SQL counts by period still use the windowed rows).
async function fetchAllTimeContactToCampaignId(): Promise<Map<string, string>> {
  const [leadRows, campaignKeyRows] = await Promise.all([
    withCache('lead-form-rows::all-time', () => fetchLeadFormRows(null, null)),
    withCache('campaign-key-rows', fetchCampaignKeyRows),
  ])

  const campaignKeyMap = new Map<string, string>()
  for (const row of campaignKeyRows) {
    campaignKeyMap.set(campaignKeyLookupKey(row.platform.toLowerCase() as Platform, row.campaign_name), row.campaign_id)
  }

  const contactToCampaignId = new Map<string, string>()
  for (const row of leadRows) {
    if (!row.contact_id || contactToCampaignId.has(row.contact_id)) continue

    const hsaCam = (row.forms_hsa_cam ?? '').trim()
    const platform = platformFromUtmSource(row.forms_hs_utm_source)

    if (hsaCam && platform !== 'linkedin') {
      contactToCampaignId.set(row.contact_id, hsaCam)
      continue
    }

    if (platform) {
      const resolvedId = campaignKeyMap.get(campaignKeyLookupKey(platform, row.forms_hs_utm_campaign ?? ''))
      if (resolvedId) contactToCampaignId.set(row.contact_id, resolvedId)
    }
  }

  return contactToCampaignId
}

// data_hs_contacts_v2 is 800k+ rows — never read it unfiltered. Only the
// contact_ids that actually show up in this request's lead rows are looked
// up, in indexed `hs_object_id IN (...)` chunks (same pattern as the geo
// bridge lookup above).
const CONTACT_CHUNK_SIZE = 150
const CONTACT_CONCURRENCY = 4

type ContactInfoRow = { hs_object_id: string; region: string | null; lifecyclestage: string | null }

async function fetchContactInfoChunk(
  supabase: ReturnType<typeof getSupabaseClient>,
  ids: string[],
  attempt = 1
): Promise<ContactInfoRow[]> {
  const { data, error } = await supabase
    .from('data_hs_contacts_v2')
    .select('hs_object_id, region, lifecyclestage')
    .in('hs_object_id', ids)

  if (error) {
    if (attempt < 3) return fetchContactInfoChunk(supabase, ids, attempt + 1)
    throw new Error(`Falha ao consultar data_hs_contacts_v2 no Supabase: ${error.message}`)
  }

  return data ?? []
}

// The contact's `region` field already uses the same taxonomy as
// geo_bridge's region_consolidated (HISPAM/Brazil/EMEA/APAC/NA), except for
// this one label variant.
function normalizeContactRegion(region: string | null): string | null {
  if (!region) return null
  const trimmed = region.trim()
  return trimmed === 'NA and Caribbean' ? 'NA' : trimmed
}

// HubSpot's lifecyclestage only ever holds the contact's *current* stage,
// not history — a contact that has since become an opportunity/customer no
// longer shows "salesqualifiedlead" even though they passed through it. Each
// stage below is therefore "reached this stage or later", using the
// standard HubSpot funnel ordering, or it'd undercount contacts who moved on.
const LIFECYCLE_STAGE_ORDER = ['lead', 'marketingqualifiedlead', 'salesqualifiedlead', 'opportunity', 'customer']

type LifecycleFlags = { isSql: boolean; isOpportunity: boolean; isCustomer: boolean }

function lifecycleFlags(lifecyclestage: string | null): LifecycleFlags {
  const stageIndex = lifecyclestage ? LIFECYCLE_STAGE_ORDER.indexOf(lifecyclestage.trim().toLowerCase()) : -1
  const reached = (stage: string) => stageIndex >= 0 && stageIndex >= LIFECYCLE_STAGE_ORDER.indexOf(stage)
  return {
    isSql: reached('salesqualifiedlead'),
    isOpportunity: reached('opportunity'),
    isCustomer: reached('customer'),
  }
}

type ContactInfo = { region: string | null } & LifecycleFlags

async function fetchContactInfoMap(contactIds: string[]): Promise<Map<string, ContactInfo>> {
  const map = new Map<string, ContactInfo>()
  if (contactIds.length === 0) return map

  const supabase = getSupabaseClient()
  const chunks = chunk(contactIds, CONTACT_CHUNK_SIZE)
  const results = await runWithConcurrency(chunks, CONTACT_CONCURRENCY, (ids) => fetchContactInfoChunk(supabase, ids))

  for (const row of results.flat()) {
    map.set(row.hs_object_id, { region: normalizeContactRegion(row.region), ...lifecycleFlags(row.lifecyclestage) })
  }
  return map
}

// A lead that couldn't be tied to a specific campaign (paid-unattributed or
// organic) has no campaign_id, so it can't get a region via the geo bridge —
// its region (if any) comes from the HubSpot contact instead. Kept as
// individual records (rather than pre-aggregated) so the region filter can
// be applied the same way it's applied to campaign rows.
type UnresolvedLeadRecord =
  | ({ kind: 'unattributedPaid'; platform: Platform; region: string | null } & LifecycleFlags)
  | ({ kind: 'organic'; channel: OrganicChannel; region: string | null } & LifecycleFlags)

type LeadsAttributionResult = {
  leadsByCampaignId: Map<string, number>
  sqlsByCampaignId: Map<string, number>
  opportunitiesByCampaignId: Map<string, number>
  customersByCampaignId: Map<string, number>
  contactToCampaignId: Map<string, string>
  unresolvedRecords: UnresolvedLeadRecord[]
}

async function fetchLeadsAttribution(from: string | null, to: string | null): Promise<LeadsAttributionResult> {
  const [leadRows, campaignKeyRows] = await Promise.all([
    withCache(`lead-form-rows::${from}::${to}`, () => fetchLeadFormRows(from, to)),
    withCache('campaign-key-rows', fetchCampaignKeyRows),
  ])

  const campaignKeyMap = new Map<string, string>()
  for (const row of campaignKeyRows) {
    campaignKeyMap.set(campaignKeyLookupKey(row.platform.toLowerCase() as Platform, row.campaign_name), row.campaign_id)
  }

  const allContactIds = [...new Set(leadRows.map((row) => row.contact_id).filter((id): id is string => Boolean(id)))].sort()
  const contactInfo = await withCache(`contact-info::${allContactIds.join(',')}`, () => fetchContactInfoMap(allContactIds))

  const leadsByCampaignId = new Map<string, number>()
  const sqlsByCampaignId = new Map<string, number>()
  const opportunitiesByCampaignId = new Map<string, number>()
  const customersByCampaignId = new Map<string, number>()
  // First lead (in fetch order) per contact that resolved to a campaign —
  // used to attribute HubSpot deals (which only carry contact_ids) back to a
  // campaign/platform/region for the KPI filters.
  const contactToCampaignId = new Map<string, string>()
  const unresolvedRecords: UnresolvedLeadRecord[] = []

  function bump(map: Map<string, number>, key: string) {
    map.set(key, (map.get(key) ?? 0) + 1)
  }

  for (const row of leadRows) {
    const info = row.contact_id ? contactInfo.get(row.contact_id) : undefined
    const region = info?.region ?? null
    const flags: LifecycleFlags = {
      isSql: info?.isSql ?? false,
      isOpportunity: info?.isOpportunity ?? false,
      isCustomer: info?.isCustomer ?? false,
    }

    const hsaCam = (row.forms_hsa_cam ?? '').trim()
    const platform = platformFromUtmSource(row.forms_hs_utm_source)

    // forms_hsa_cam mirrors HubSpot's native Facebook ad-click auto-tagging
    // (hsa_acc/hsa_cam/hsa_grp/hsa_ad/hsa_src) and reliably holds the real
    // campaign_id for Meta and Google leads — but for LinkedIn the pipeline
    // populates the same column with something else entirely (verified: 0/10
    // sampled values matched any real campaign_id in data_linkedin_v2). For
    // LinkedIn, always resolve via the campaign-name lookup below instead.
    if (hsaCam && platform !== 'linkedin') {
      bump(leadsByCampaignId, hsaCam)
      if (flags.isSql) bump(sqlsByCampaignId, hsaCam)
      if (flags.isOpportunity) bump(opportunitiesByCampaignId, hsaCam)
      if (flags.isCustomer) bump(customersByCampaignId, hsaCam)
      if (row.contact_id && !contactToCampaignId.has(row.contact_id)) {
        contactToCampaignId.set(row.contact_id, hsaCam)
      }
      continue
    }

    if (platform) {
      const lookupKey = campaignKeyLookupKey(platform, row.forms_hs_utm_campaign ?? '')
      const resolvedId = campaignKeyMap.get(lookupKey)
      if (resolvedId) {
        bump(leadsByCampaignId, resolvedId)
        if (flags.isSql) bump(sqlsByCampaignId, resolvedId)
        if (flags.isOpportunity) bump(opportunitiesByCampaignId, resolvedId)
        if (flags.isCustomer) bump(customersByCampaignId, resolvedId)
        if (row.contact_id && !contactToCampaignId.has(row.contact_id)) {
          contactToCampaignId.set(row.contact_id, resolvedId)
        }
      } else {
        unresolvedRecords.push({ kind: 'unattributedPaid', platform, region, ...flags })
      }
      continue
    }

    const channel = classifyOrganicChannel(row.forms_hs_utm_source, row.forms_hs_referrer)
    unresolvedRecords.push({ kind: 'organic', channel, region, ...flags })
  }

  return {
    leadsByCampaignId,
    sqlsByCampaignId,
    opportunitiesByCampaignId,
    customersByCampaignId,
    contactToCampaignId,
    unresolvedRecords,
  }
}

type DealRow = {
  hs_object_id: string
  contact_ids: string[] | null
  first_meeting_status: string | null
  dealstage: string | null
}

const VALIDATED_MEETING_STATUS = 'Validated'
const DISQUALIFIED_MEETING_STATUS = 'No Fit'

async function fetchDealRows(leadsFrom: string | null, leadsTo: string | null): Promise<DealRow[]> {
  const supabase = getSupabaseClient()
  return fetchAllRows<DealRow>(() => {
    let query = supabase
      .from('data_hs_deals_v2')
      .select('hs_object_id, contact_ids, first_meeting_status, dealstage, createdate')
    if (leadsFrom) query = query.gte('createdate', leadsFrom)
    if (leadsTo) query = query.lte('createdate', leadsTo)
    return query
  }, 'data_hs_deals_v2')
}

type DealsKpi = { leadsTotal: number; validatedDeals: number }

// A deal only carries contact_ids, not a campaign — it's attributed via the
// first associated contact that itself resolved to a campaign (same
// resolution as fetchLeadsAttribution), then kept only if that campaign is
// part of the currently filtered campaign set (platform/region/country).
function computeDealsKpi(
  dealRows: DealRow[],
  contactToCampaignId: Map<string, string>,
  filteredCampaignIds: Set<string>,
  leadsTotal: number
): DealsKpi {
  let validatedDeals = 0

  for (const deal of dealRows) {
    const campaignId = (deal.contact_ids ?? [])
      .map((contactId) => contactToCampaignId.get(contactId))
      .find((id): id is string => Boolean(id))

    if (!campaignId || !filteredCampaignIds.has(campaignId)) continue
    if (deal.first_meeting_status === VALIDATED_MEETING_STATUS) validatedDeals += 1
  }

  return { leadsTotal, validatedDeals }
}

type OverviewContactRow = {
  hs_object_id: string
  lifecyclestage: string | null
  not_qualified_reason: string | null
  createdate: string
}

// data_hs_contacts_v2 is 800k+ rows. `createdate` is indexed (a plain range
// filter on it stays fast, ~1-2s/page), but `region` doesn't appear to be —
// filtering on both together routinely blows the Postgres statement timeout.
// So this only ever filters by createdate at the DB level (cached once per
// date range and shared across every region tab) and filters by region
// afterwards, in memory.
async function fetchContactsInDateRange(
  leadsFrom: string | null,
  leadsTo: string | null
): Promise<(OverviewContactRow & { region: string | null })[]> {
  const supabase = getSupabaseClient()
  return fetchAllRows<OverviewContactRow & { region: string | null }>(() => {
    let query = supabase
      .from('data_hs_contacts_v2')
      .select('hs_object_id, region, lifecyclestage, not_qualified_reason, createdate')
    if (leadsFrom) query = query.gte('createdate', leadsFrom)
    if (leadsTo) query = query.lte('createdate', leadsTo)
    return query
  }, 'data_hs_contacts_v2')
}

async function fetchOverviewContacts(
  region: string,
  leadsFrom: string | null,
  leadsTo: string | null
): Promise<OverviewContactRow[]> {
  const rows = await withCache(`contacts-in-range::${leadsFrom}::${leadsTo}`, () =>
    fetchContactsInDateRange(leadsFrom, leadsTo)
  )
  return rows.filter((row) => normalizeContactRegion(row.region) === region)
}

// A deal's stage decides whether it's still open ("active"), lost, or won —
// matched by keyword rather than an exact list because stage labels vary per
// pipeline (BDRs, Partnerships, Revenue Expansions, ...) and carry emoji
// suffixes (e.g. "Lost ♻️", "Postponed ⏱️").
const LOST_STAGE_PATTERN = /lost|recycling|postponed|churned/i
const WON_STAGE_PATTERN = /won/i

function dealStageBucket(dealstage: string | null): 'lost' | 'won' | 'active' {
  if (dealstage && LOST_STAGE_PATTERN.test(dealstage)) return 'lost'
  if (dealstage && WON_STAGE_PATTERN.test(dealstage)) return 'won'
  return 'active'
}

function emptyOverviewCategory(): OverviewCategory {
  return { total: 0, byLifecycleStage: {}, byDealStage: {} }
}

function addToBreakdown(breakdown: StageBreakdown, key: string) {
  breakdown[key] = (breakdown[key] ?? 0) + 1
}

function addToCategory(category: OverviewCategory, lifecyclestage: string | null, dealstage: string | null) {
  category.total += 1
  addToBreakdown(category.byLifecycleStage, lifecyclestage?.trim() || 'sem lifecycle')
  addToBreakdown(category.byDealStage, dealstage?.trim() || 'sem deal')
}

// Classifies each contact into exactly one of disqualified/lost/active
// (contacts with no deal, or only a won deal, land in none of the three —
// "won" isn't one of the requested Overview buckets) — and independently
// flags whether they ever reached SQL, using the same lifecycle-stage
// resolution as the rest of the dashboard.
function computeInboundOverview(contacts: OverviewContactRow[], dealRows: DealRow[]): InboundOverview {
  const dealsByContactId = new Map<string, DealRow[]>()
  for (const deal of dealRows) {
    for (const contactId of deal.contact_ids ?? []) {
      const list = dealsByContactId.get(contactId)
      if (list) list.push(deal)
      else dealsByContactId.set(contactId, [deal])
    }
  }

  const active = emptyOverviewCategory()
  const validated = emptyOverviewCategory()
  const lost = emptyOverviewCategory()
  const disqualified = emptyOverviewCategory()

  for (const contact of contacts) {
    const deals = dealsByContactId.get(contact.hs_object_id) ?? []

    const isDisqualified =
      Boolean(contact.not_qualified_reason?.trim()) ||
      deals.some((d) => d.first_meeting_status === DISQUALIFIED_MEETING_STATUS)

    const activeDeal = deals.find((d) => dealStageBucket(d.dealstage) === 'active')
    const lostDeal = deals.find((d) => dealStageBucket(d.dealstage) === 'lost')
    const disqualifyingDeal = deals.find((d) => d.first_meeting_status === DISQUALIFIED_MEETING_STATUS)

    if (isDisqualified) {
      addToCategory(disqualified, contact.lifecyclestage, disqualifyingDeal?.dealstage ?? null)
    } else if (activeDeal) {
      addToCategory(active, contact.lifecyclestage, activeDeal.dealstage)
    } else if (lostDeal) {
      addToCategory(lost, contact.lifecyclestage, lostDeal.dealstage)
    }

    if (lifecycleFlags(contact.lifecyclestage).isSql) {
      addToCategory(validated, contact.lifecyclestage, deals[0]?.dealstage ?? null)
    }
  }

  return { totalContacts: contacts.length, active, validated, lost, disqualified }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  // Ad spend tables (date/date_start) are already keyed by ad-platform report
  // day, so `from`/`to` are used as-is for them. Lead timestamps
  // (submitted_at) are stored in UTC, so counting them by day requires the
  // caller's local-timezone day boundaries — leadsFrom/leadsTo carry those as
  // full ISO instants, computed client-side from the browser's timezone, so
  // a day's lead volume here matches what the platform (e.g. Meta) shows for
  // that same local day. Falls back to from/to for direct/manual API calls.
  const leadsFrom = searchParams.get('leadsFrom') ?? from
  const leadsTo = searchParams.get('leadsTo') ?? to
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

  // The Overview ("View" = general) screen additionally needs contacts —
  // only fetched when no specific platform is selected, since it's a
  // separate, more expensive query against the 800k-row contacts table.
  const wantsOverview = !platformParam && Boolean(regionParam)

  try {
    const [spendResults, currencyMap, leads, dealRows, overviewContacts, allTimeContactToCampaignId] =
      await Promise.all([
        Promise.all(
          platformsToFetch.map((platform) =>
            withCache(`spend::${platform}::${from}::${to}`, () => FETCHERS[platform](from, to))
          )
        ),
        fetchCurrencyMap(),
        fetchLeadsAttribution(leadsFrom, leadsTo),
        withCache(`deal-rows::${leadsFrom}::${leadsTo}`, () => fetchDealRows(leadsFrom, leadsTo)),
        wantsOverview ? fetchOverviewContacts(regionParam as string, leadsFrom, leadsTo) : Promise.resolve(null),
        withCache('contact-to-campaign::all-time', fetchAllTimeContactToCampaignId),
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
          leads: leads.leadsByCampaignId.get(row.campaign_id) ?? 0,
          cpl: null,
          sql: leads.sqlsByCampaignId.get(row.campaign_id) ?? 0,
          cpsql: null,
          opportunity: leads.opportunitiesByCampaignId.get(row.campaign_id) ?? 0,
          cpopportunity: null,
          customer: leads.customersByCampaignId.get(row.campaign_id) ?? 0,
          cpcustomer: null,
        })
      }
    }

    for (const summary of aggregated.values()) {
      summary.cpl = summary.leads > 0 ? summary.spend / summary.leads : null
      summary.cpsql = summary.sql > 0 ? summary.spend / summary.sql : null
      summary.cpopportunity = summary.opportunity > 0 ? summary.spend / summary.opportunity : null
      summary.cpcustomer = summary.customer > 0 ? summary.spend / summary.customer : null
    }

    let data = [...aggregated.values()]

    if (regionParam) {
      data = data.filter((row) => row.region === regionParam)
    }
    if (countryParam) {
      data = data.filter((row) => row.countries.includes(countryParam))
    }

    const filteredCampaignIds = new Set(data.map((row) => row.campaign_id))
    const leadsTotal = data.reduce((sum, row) => sum + row.leads, 0)
    const kpis = computeDealsKpi(dealRows, allTimeContactToCampaignId, filteredCampaignIds, leadsTotal)

    // Unattributed/organic leads have no campaign_id, so region comes from
    // the HubSpot contact instead (resolved in fetchLeadsAttribution) — a
    // region filter drops any record whose contact region doesn't match,
    // same as it does for campaign rows above. There's currently no country
    // filter here: the contact's country is free text (e.g. "Mexico"),
    // not the ISO codes the country dropdown uses.
    const regionFilteredRecords = regionParam
      ? leads.unresolvedRecords.filter((record) => record.region === regionParam)
      : leads.unresolvedRecords

    const emptyEntry = (): ChannelBreakdownEntry => ({ leads: 0, sql: 0, opportunity: 0, customer: 0 })
    const unattributedByPlatform: Partial<Record<Platform, ChannelBreakdownEntry>> = {}
    const organicByChannel: Partial<Record<OrganicChannel, ChannelBreakdownEntry>> = {}
    for (const record of regionFilteredRecords) {
      if (record.kind === 'unattributedPaid') {
        const entry = unattributedByPlatform[record.platform] ?? emptyEntry()
        entry.leads += 1
        if (record.isSql) entry.sql += 1
        if (record.isOpportunity) entry.opportunity += 1
        if (record.isCustomer) entry.customer += 1
        unattributedByPlatform[record.platform] = entry
      } else {
        const entry = organicByChannel[record.channel] ?? emptyEntry()
        entry.leads += 1
        if (record.isSql) entry.sql += 1
        if (record.isOpportunity) entry.opportunity += 1
        if (record.isCustomer) entry.customer += 1
        organicByChannel[record.channel] = entry
      }
    }
    const sumEntries = (bucket: Partial<Record<string, ChannelBreakdownEntry>>, field: keyof ChannelBreakdownEntry) =>
      Object.values(bucket).reduce((sum, entry) => sum + (entry?.[field] ?? 0), 0)
    const leadsAttribution: LeadsAttributionSummary = {
      unattributedPaid: {
        total: sumEntries(unattributedByPlatform, 'leads'),
        totalSql: sumEntries(unattributedByPlatform, 'sql'),
        totalOpportunity: sumEntries(unattributedByPlatform, 'opportunity'),
        totalCustomer: sumEntries(unattributedByPlatform, 'customer'),
        byPlatform: unattributedByPlatform,
      },
      organic: {
        total: sumEntries(organicByChannel, 'leads'),
        totalSql: sumEntries(organicByChannel, 'sql'),
        totalOpportunity: sumEntries(organicByChannel, 'opportunity'),
        totalCustomer: sumEntries(organicByChannel, 'customer'),
        byChannel: organicByChannel,
      },
    }

    const overview = overviewContacts ? computeInboundOverview(overviewContacts, dealRows) : null

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
        leadsAttribution,
        kpis,
        overview,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro desconhecido ao consultar o Supabase.' },
      { status: 502 }
    )
  }
}
