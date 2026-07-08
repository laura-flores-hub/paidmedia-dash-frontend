import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import type { Platform, PaidMediaRow } from '@/types/paid-media'

const PLATFORMS: Platform[] = ['google', 'meta', 'linkedin']

async function fetchGoogle(from: string | null, to: string | null): Promise<PaidMediaRow[]> {
  const supabase = getSupabaseClient()
  let query = supabase
    .from('data_google_v2')
    .select('campaign_id, campaign_name, spend, date, ad_account_id')

  if (from) query = query.gte('date', from)
  if (to) query = query.lte('date', to)

  const { data, error } = await query
  if (error) throw new Error(`Falha ao consultar data_google_v2 no Supabase: ${error.message}`)

  return (data ?? []).map((row) => ({
    platform: 'google' as const,
    campaign_id: row.campaign_id,
    campaign_name: row.campaign_name,
    ad_account_id: row.ad_account_id,
    spend: row.spend,
    date: row.date,
  }))
}

async function fetchMeta(from: string | null, to: string | null): Promise<PaidMediaRow[]> {
  const supabase = getSupabaseClient()
  let query = supabase
    .from('data_meta_v2')
    .select('campaign_id, campaign_name, cost, date_start, ad_account_id')

  if (from) query = query.gte('date_start', from)
  if (to) query = query.lte('date_start', to)

  const { data, error } = await query
  if (error) throw new Error(`Falha ao consultar data_meta_v2 no Supabase: ${error.message}`)

  return (data ?? []).map((row) => ({
    platform: 'meta' as const,
    campaign_id: row.campaign_id,
    campaign_name: row.campaign_name,
    ad_account_id: row.ad_account_id,
    spend: row.cost,
    date: row.date_start,
  }))
}

async function fetchLinkedin(from: string | null, to: string | null): Promise<PaidMediaRow[]> {
  const supabase = getSupabaseClient()
  let query = supabase
    .from('data_linkedin_v2')
    .select('campaign_id, campaign_name, cost, date_start, ad_account_id')

  if (from) query = query.gte('date_start', from)
  if (to) query = query.lte('date_start', to)

  const { data, error } = await query
  if (error) throw new Error(`Falha ao consultar data_linkedin_v2 no Supabase: ${error.message}`)

  return (data ?? []).map((row) => ({
    platform: 'linkedin' as const,
    campaign_id: row.campaign_id,
    campaign_name: row.campaign_name,
    ad_account_id: row.ad_account_id,
    spend: row.cost,
    date: row.date_start,
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

  if (platformParam && !PLATFORMS.includes(platformParam as Platform)) {
    return NextResponse.json(
      { error: `Parâmetro "platform" inválido: "${platformParam}". Use google, meta ou linkedin.` },
      { status: 400 }
    )
  }

  const platformsToFetch: Platform[] = platformParam ? [platformParam as Platform] : PLATFORMS

  try {
    const results = await Promise.all(
      platformsToFetch.map((platform) => FETCHERS[platform](from, to))
    )
    const data = results.flat()

    return NextResponse.json({
      data,
      meta: {
        from: from ?? null,
        to: to ?? null,
        platform: platformParam ? (platformParam as Platform) : 'all',
        count: data.length,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro desconhecido ao consultar o Supabase.' },
      { status: 502 }
    )
  }
}
