'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useInView, useMotionValue, animate as fmAnimate } from 'framer-motion'
import type {
  CampaignSummary,
  DealsKpi,
  GeoOptions,
  InboundOverview,
  LeadsAttributionSummary,
  OrganicChannel,
  OverviewCategory,
  Platform,
} from '@/types/paid-media'
import { useLanguage } from '@/lib/useLanguage'
import { LANGUAGES, type TranslationKey } from '@/lib/i18n'
import { ACCENT, CURRENCY_COLOR, EASE, PLATFORM_COLOR, SPRING, T } from '@/lib/tokens'

type SortDirection = 'asc' | 'desc'

const PLATFORM_LABELS: Record<Platform, string> = {
  google: 'Google',
  meta: 'Meta',
  linkedin: 'LinkedIn',
}
const PLATFORM_OPTIONS: Array<Platform | 'all' | 'other'> = ['all', 'google', 'meta', 'linkedin', 'other']
// Overview ("all") is hidden from the View switcher until its data issues
// are sorted out — kept in PLATFORM_OPTIONS/OverviewSection so it's a small
// change to bring back, just not user-facing for now.
const VISIBLE_PLATFORM_OPTIONS: Array<Platform | 'all' | 'other'> = PLATFORM_OPTIONS.filter((p) => p !== 'all')

const ORGANIC_CHANNELS: OrganicChannel[] = [
  'email',
  'agentes_ia',
  'busca_organica',
  'referral',
  'social_media',
  'trafego_direto',
  'outros',
]

const EMPTY_LEADS_ATTRIBUTION: LeadsAttributionSummary = {
  unattributedPaid: { total: 0, totalSql: 0, totalOpportunity: 0, totalCustomer: 0, byPlatform: {} },
  organic: { total: 0, totalSql: 0, totalOpportunity: 0, totalCustomer: 0, byChannel: {} },
}

function formatNumber(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatCurrency(value: number, currency: string) {
  return `${currency} ${formatNumber(value)}`
}

// Converts a plain "YYYY-MM-DD" filter into the UTC instant for the start/end
// of that day in the browser's own timezone (no explicit offset in the
// string means Date parses it as local time), so leads get counted by the
// same local day the user sees in Meta/Google/LinkedIn's own interfaces.
function localDayBoundaryToIso(dateStr: string, endOfDay: boolean): string {
  const time = endOfDay ? '23:59:59.999' : '00:00:00.000'
  return new Date(`${dateStr}T${time}`).toISOString()
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function currentMonthStart(): string {
  const now = new Date()
  return formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1))
}

function todayLocalDate(): string {
  return formatLocalDate(new Date())
}

const REGION_OPTIONS = ['Brazil', 'HISPAM', 'EMEA', 'NA', 'APAC']
const DEFAULT_REGION = REGION_OPTIONS[0]

// The period immediately preceding [from, to], with the same number of days,
// used as the baseline for the "% change vs previous period" KPIs.
function previousPeriodRange(from: string, to: string): { prevFrom: string; prevTo: string } {
  const fromDate = new Date(`${from}T00:00:00`)
  const toDate = new Date(`${to}T00:00:00`)
  const spanDays = Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1

  const prevTo = new Date(fromDate)
  prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo)
  prevFrom.setDate(prevFrom.getDate() - (spanDays - 1))

  return { prevFrom: formatLocalDate(prevFrom), prevTo: formatLocalDate(prevTo) }
}

type CurrencyAgg = { spend: Record<string, number>; leads: Record<string, number> }

function aggregateByCurrency(rows: CampaignSummary[]): CurrencyAgg {
  const spend: Record<string, number> = {}
  const leads: Record<string, number> = {}
  for (const row of rows) {
    spend[row.currency] = (spend[row.currency] ?? 0) + row.spend
    leads[row.currency] = (leads[row.currency] ?? 0) + row.leads
  }
  return { spend, leads }
}

function pctChange(curr: number, prev: number | null | undefined): number | null {
  if (prev === null || prev === undefined) return null
  if (prev === 0) return curr === 0 ? 0 : null
  return ((curr - prev) / prev) * 100
}

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null
  const flat = Math.abs(pct) < 0.05
  const positive = pct > 0
  const color = flat ? T.inkFaint : positive ? ACCENT.teal : '#c22f2f'
  const arrow = flat ? '' : positive ? '↑ ' : '↓ '

  return (
    <div style={{ fontSize: 12, fontWeight: 600, color, marginTop: 6 }}>
      {arrow}
      {Math.abs(pct).toFixed(1)}%
    </div>
  )
}

function AnimatedNumber({ value, formatValue }: { value: number; formatValue: (v: number) => string }) {
  const mv = useMotionValue(0)
  const [display, setDisplay] = useState(formatValue(0))

  useEffect(() => {
    const controls = fmAnimate(mv, value, {
      duration: 1.0,
      ease: EASE,
      onUpdate: (latest) => setDisplay(formatValue(latest)),
    })
    return () => controls.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return <span>{display}</span>
}

function SummaryCard({
  label,
  value,
  formatValue,
  glowColor,
  changePct,
  index,
}: {
  label: string
  value: number
  formatValue: (v: number) => string
  glowColor: string
  changePct?: number | null
  index: number
}) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease: EASE, delay: index * 0.08 }}
      style={{
        background: T.surface,
        borderRadius: 16,
        padding: '20px 22px',
        boxShadow: T.shadow4,
        border: `1px solid ${T.border}`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -40,
          right: -40,
          width: 120,
          height: 120,
          background: `radial-gradient(circle, ${glowColor}14, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />
      <div style={{ fontSize: 12, letterSpacing: 0.2, color: T.inkFaint, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, lineHeight: 1.3, fontWeight: 600, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>
        <AnimatedNumber value={value} formatValue={formatValue} />
      </div>
      <ChangeBadge pct={changePct ?? null} />
    </motion.div>
  )
}

function PlatformFilterPill({
  active,
  onChange,
  label,
  allLabel,
  otherLabel,
}: {
  active: Platform | 'all' | 'other'
  onChange: (p: Platform | 'all' | 'other') => void
  label: string
  allLabel: string
  otherLabel: string
}) {
  return (
    <div>
      <div style={{ fontSize: 12, color: T.inkFaint, marginBottom: 6 }}>{label}</div>
      <div
        style={{
          display: 'inline-flex',
          background: T.surface,
          borderRadius: 999,
          padding: 4,
          border: `1px solid ${T.border}`,
          boxShadow: T.shadow4,
        }}
      >
        {VISIBLE_PLATFORM_OPTIONS.map((p) => {
          const isActive = p === active
          return (
            <button
              key={p}
              onClick={() => onChange(p)}
              style={{
                position: 'relative',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 600,
                color: isActive ? T.surface : T.inkSoft,
                borderRadius: 999,
                zIndex: 1,
                transition: 'color 0.3s',
              }}
            >
              {isActive && (
                <motion.span
                  layoutId="platform-pill"
                  transition={SPRING}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: p === 'all' ? T.brand500 : p === 'other' ? ACCENT.teal : PLATFORM_COLOR[p],
                    borderRadius: 999,
                    zIndex: -1,
                  }}
                />
              )}
              {p === 'all' ? allLabel : p === 'other' ? otherLabel : PLATFORM_LABELS[p]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function RegionSidebar({ active, onChange }: { active: string; onChange: (region: string) => void }) {
  return (
    <nav
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        background: T.surface,
        borderRadius: 16,
        padding: 8,
        border: `1px solid ${T.border}`,
        boxShadow: T.shadow4,
        height: 'fit-content',
        position: 'fixed',
        top: 24,
        left: 24,
      }}
    >
      {REGION_OPTIONS.map((r) => {
        const isActive = r === active
        return (
          <button
            key={r}
            onClick={() => onChange(r)}
            style={{
              position: 'relative',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              textAlign: 'left',
              color: isActive ? T.surface : T.inkSoft,
              borderRadius: 10,
              zIndex: 1,
              transition: 'color 0.3s',
            }}
          >
            {isActive && (
              <motion.span
                layoutId="region-tab"
                transition={SPRING}
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: T.brand500,
                  borderRadius: 10,
                  zIndex: -1,
                }}
              />
            )}
            {r}
          </button>
        )
      })}
    </nav>
  )
}

function StageBreakdownTable({
  title,
  breakdown,
}: {
  title: string
  breakdown: Record<string, number>
}) {
  const rows = Object.entries(breakdown).sort((a, b) => b[1] - a[1])

  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: T.inkFaint, marginBottom: 8 }}>{title}</div>
      <table style={{ width: '100%', textAlign: 'left', fontSize: 13, borderCollapse: 'collapse' }}>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td style={{ padding: '6px 0', color: T.inkFaint }}>—</td>
            </tr>
          ) : (
            rows.map(([key, count]) => (
              <tr key={key} style={{ borderBottom: `1px solid ${T.border}` }}>
                <td style={{ padding: '6px 8px 6px 0', color: T.inkSoft }}>{key}</td>
                <td style={{ padding: '6px 0', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{count}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function OverviewCategoryCard({
  label,
  glowColor,
  category,
  t,
}: {
  label: string
  glowColor: string
  category: OverviewCategory
  t: (key: TranslationKey) => string
}) {
  return (
    <section
      style={{
        background: T.surface,
        borderRadius: 16,
        padding: 20,
        boxShadow: T.shadow4,
        border: `1px solid ${T.border}`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -40,
          right: -40,
          width: 120,
          height: 120,
          background: `radial-gradient(circle, ${glowColor}14, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />
      <div style={{ fontSize: 13, fontWeight: 600, color: T.inkFaint, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600, color: T.ink, marginBottom: 16, fontVariantNumeric: 'tabular-nums' }}>
        {category.total}
      </div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <StageBreakdownTable title={t('overview.byLifecycleStage')} breakdown={category.byLifecycleStage} />
        <StageBreakdownTable title={t('overview.byDealStage')} breakdown={category.byDealStage} />
      </div>
    </section>
  )
}

// Draft / hidden for now — the detailed breakdown-per-card version of the
// Overview screen. Kept here, not rendered, in case we bring it back.
function OverviewSectionDetailed({
  overview,
  t,
}: {
  overview: InboundOverview | null
  t: (key: TranslationKey) => string
}) {
  if (!overview) return null

  return (
    <>
      <section
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: T.surface,
            borderRadius: 16,
            padding: '20px 22px',
            boxShadow: T.shadow4,
            border: `1px solid ${T.border}`,
          }}
        >
          <div style={{ fontSize: 12, letterSpacing: 0.2, color: T.inkFaint, marginBottom: 8 }}>
            {t('overview.totalContacts')}
          </div>
          <div style={{ fontSize: 28, fontWeight: 600, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>
            {overview.totalContacts}
          </div>
        </div>
      </section>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <OverviewCategoryCard label={t('overview.active')} glowColor={ACCENT.teal} category={overview.active} t={t} />
        <OverviewCategoryCard
          label={t('overview.validated')}
          glowColor={ACCENT.cyanDim}
          category={overview.validated}
          t={t}
        />
        <OverviewCategoryCard label={t('overview.lost')} glowColor={'#c22f2f'} category={overview.lost} t={t} />
        <OverviewCategoryCard
          label={t('overview.disqualified')}
          glowColor={ACCENT.purple}
          category={overview.disqualified}
          t={t}
        />
      </div>
    </>
  )
}

function OverviewSection({ overview, t }: { overview: InboundOverview | null; t: (key: TranslationKey) => string }) {
  if (!overview) return null

  return (
    <section
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 24,
      }}
    >
      <SummaryCard
        label={t('overview.totalContacts')}
        value={overview.totalContacts}
        formatValue={(v) => Math.round(v).toLocaleString('pt-BR')}
        glowColor={ACCENT.teal}
        index={0}
      />
      <SummaryCard
        label={t('overview.active')}
        value={overview.active.total}
        formatValue={(v) => Math.round(v).toLocaleString('pt-BR')}
        glowColor={ACCENT.cyanDim}
        index={1}
      />
      <SummaryCard
        label={t('overview.validated')}
        value={overview.validated.total}
        formatValue={(v) => Math.round(v).toLocaleString('pt-BR')}
        glowColor={ACCENT.cyanDim}
        index={2}
      />
      <SummaryCard
        label={t('overview.lost')}
        value={overview.lost.total}
        formatValue={(v) => Math.round(v).toLocaleString('pt-BR')}
        glowColor={'#c22f2f'}
        index={3}
      />
      <SummaryCard
        label={t('overview.disqualified')}
        value={overview.disqualified.total}
        formatValue={(v) => Math.round(v).toLocaleString('pt-BR')}
        glowColor={ACCENT.purple}
        index={4}
      />
    </section>
  )
}

function LeadsAttributionSection({
  leadsAttribution,
  t,
}: {
  leadsAttribution: LeadsAttributionSummary
  t: (key: TranslationKey) => string
}) {
  const emptyEntry = { leads: 0, sql: 0, opportunity: 0, customer: 0 }

  const platformRows = PLATFORM_OPTIONS.filter((p): p is Platform => p !== 'all' && p !== 'other')
    .map((p) => ({ label: PLATFORM_LABELS[p], ...(leadsAttribution.unattributedPaid.byPlatform[p] ?? emptyEntry) }))
    .filter((r) => r.leads > 0)

  const organicRows = ORGANIC_CHANNELS.map((channel) => ({
    label: t(`channel.${channel}` as TranslationKey),
    ...(leadsAttribution.organic.byChannel[channel] ?? emptyEntry),
  })).filter((r) => r.leads > 0)

  return (
    <section
      style={{
        overflowX: 'auto',
        borderRadius: 16,
        border: `1px solid ${T.border}`,
        background: T.surface,
        boxShadow: T.shadow4,
        marginTop: 24,
      }}
    >
      <div style={{ padding: '16px 16px 0', fontSize: 15, fontWeight: 600, color: T.ink }}>
        {t('leadsAttribution.title')}
      </div>
      <table style={{ width: '100%', minWidth: 480, textAlign: 'left', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.border}`, color: T.inkFaint }}>
            <th style={{ padding: '10px 16px' }}>{t('leadsAttribution.category')}</th>
            <th style={{ padding: '10px 16px' }}>{t('leadsAttribution.leads')}</th>
            <th style={{ padding: '10px 16px' }}>{t('leadsAttribution.sql')}</th>
            <th style={{ padding: '10px 16px' }}>{t('leadsAttribution.opportunity')}</th>
            <th style={{ padding: '10px 16px' }}>{t('leadsAttribution.customer')}</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: `1px solid ${T.border}`, fontWeight: 600 }}>
            <td style={{ padding: '10px 16px' }}>{t('leadsAttribution.unattributedPaid')}</td>
            <td style={{ padding: '10px 16px', fontVariantNumeric: 'tabular-nums' }}>
              {leadsAttribution.unattributedPaid.total}
            </td>
            <td style={{ padding: '10px 16px', fontVariantNumeric: 'tabular-nums' }}>
              {leadsAttribution.unattributedPaid.totalSql}
            </td>
            <td style={{ padding: '10px 16px', fontVariantNumeric: 'tabular-nums' }}>
              {leadsAttribution.unattributedPaid.totalOpportunity}
            </td>
            <td style={{ padding: '10px 16px', fontVariantNumeric: 'tabular-nums' }}>
              {leadsAttribution.unattributedPaid.totalCustomer}
            </td>
          </tr>
          {platformRows.length === 0 ? (
            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
              <td colSpan={5} style={{ padding: '8px 16px 8px 32px', color: T.inkFaint }}>
                {t('leadsAttribution.empty')}
              </td>
            </tr>
          ) : (
            platformRows.map((row) => (
              <tr key={row.label} style={{ borderBottom: `1px solid ${T.border}` }}>
                <td style={{ padding: '8px 16px 8px 32px', color: T.inkSoft }}>{row.label}</td>
                <td style={{ padding: '8px 16px', fontVariantNumeric: 'tabular-nums', color: T.inkSoft }}>
                  {row.leads}
                </td>
                <td style={{ padding: '8px 16px', fontVariantNumeric: 'tabular-nums', color: T.inkSoft }}>
                  {row.sql}
                </td>
                <td style={{ padding: '8px 16px', fontVariantNumeric: 'tabular-nums', color: T.inkSoft }}>
                  {row.opportunity}
                </td>
                <td style={{ padding: '8px 16px', fontVariantNumeric: 'tabular-nums', color: T.inkSoft }}>
                  {row.customer}
                </td>
              </tr>
            ))
          )}

          <tr style={{ borderBottom: `1px solid ${T.border}`, fontWeight: 600 }}>
            <td style={{ padding: '10px 16px' }}>{t('leadsAttribution.organic')}</td>
            <td style={{ padding: '10px 16px', fontVariantNumeric: 'tabular-nums' }}>
              {leadsAttribution.organic.total}
            </td>
            <td style={{ padding: '10px 16px', fontVariantNumeric: 'tabular-nums' }}>
              {leadsAttribution.organic.totalSql}
            </td>
            <td style={{ padding: '10px 16px', fontVariantNumeric: 'tabular-nums' }}>
              {leadsAttribution.organic.totalOpportunity}
            </td>
            <td style={{ padding: '10px 16px', fontVariantNumeric: 'tabular-nums' }}>
              {leadsAttribution.organic.totalCustomer}
            </td>
          </tr>
          {organicRows.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: '8px 16px 8px 32px', color: T.inkFaint }}>
                {t('leadsAttribution.empty')}
              </td>
            </tr>
          ) : (
            organicRows.map((row) => (
              <tr key={row.label} style={{ borderBottom: `1px solid ${T.border}` }}>
                <td style={{ padding: '8px 16px 8px 32px', color: T.inkSoft }}>{row.label}</td>
                <td style={{ padding: '8px 16px', fontVariantNumeric: 'tabular-nums', color: T.inkSoft }}>
                  {row.leads}
                </td>
                <td style={{ padding: '8px 16px', fontVariantNumeric: 'tabular-nums', color: T.inkSoft }}>
                  {row.sql}
                </td>
                <td style={{ padding: '8px 16px', fontVariantNumeric: 'tabular-nums', color: T.inkSoft }}>
                  {row.opportunity}
                </td>
                <td style={{ padding: '8px 16px', fontVariantNumeric: 'tabular-nums', color: T.inkSoft }}>
                  {row.customer}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  )
}

const inputStyle: React.CSSProperties = {
  borderRadius: 10,
  border: `1px solid ${T.border}`,
  padding: '8px 12px',
  fontSize: 13,
  color: T.ink,
  background: T.surface,
  fontFamily: 'inherit',
}

export default function Home() {
  const { language, cycleLanguage, t } = useLanguage()

  const [from, setFrom] = useState(currentMonthStart)
  const [to, setTo] = useState(todayLocalDate)
  const [platform, setPlatform] = useState<Platform | 'all' | 'other'>('google')
  const [region, setRegion] = useState(DEFAULT_REGION)
  const [country, setCountry] = useState('all')

  const [rows, setRows] = useState<CampaignSummary[]>([])
  const [geoOptions, setGeoOptions] = useState<GeoOptions>({ regions: [], countriesByRegion: {} })
  const [leadsAttribution, setLeadsAttribution] = useState<LeadsAttributionSummary>(EMPTY_LEADS_ATTRIBUTION)
  const [kpis, setKpis] = useState<DealsKpi | null>(null)
  const [overview, setOverview] = useState<InboundOverview | null>(null)
  const [previousRows, setPreviousRows] = useState<CampaignSummary[] | null>(null)
  const [previousKpis, setPreviousKpis] = useState<DealsKpi | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  useEffect(() => {
    const controller = new AbortController()

    function buildParams(periodFrom: string, periodTo: string): URLSearchParams {
      const params = new URLSearchParams()
      if (periodFrom) {
        params.set('from', periodFrom)
        params.set('leadsFrom', localDayBoundaryToIso(periodFrom, false))
      }
      if (periodTo) {
        params.set('to', periodTo)
        params.set('leadsTo', localDayBoundaryToIso(periodTo, true))
      }
      if (platform !== 'all' && platform !== 'other') params.set('platform', platform)
      params.set('region', region)
      if (country !== 'all') params.set('country', country)
      return params
    }

    async function fetchPeriod(periodFrom: string, periodTo: string) {
      const params = buildParams(periodFrom, periodTo)
      const res = await fetch(`/api/paid-media?${params.toString()}`, { signal: controller.signal })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      return body
    }

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const previousRange = from && to ? previousPeriodRange(from, to) : null
        const [body, previousBody] = await Promise.all([
          fetchPeriod(from, to),
          previousRange ? fetchPeriod(previousRange.prevFrom, previousRange.prevTo) : null,
        ])

        setRows(body.data)
        setGeoOptions(body.meta.geoOptions)
        setLeadsAttribution(body.meta.leadsAttribution ?? EMPTY_LEADS_ATTRIBUTION)
        setKpis(body.meta.kpis ?? null)
        setOverview(body.meta.overview ?? null)
        setPreviousRows(previousBody ? previousBody.data : null)
        setPreviousKpis(previousBody ? previousBody.meta.kpis ?? null : null)
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Erro desconhecido ao buscar dados.')
        setRows([])
        setLeadsAttribution(EMPTY_LEADS_ATTRIBUTION)
        setKpis(null)
        setOverview(null)
        setPreviousRows(null)
        setPreviousKpis(null)
      } finally {
        setLoading(false)
      }
    }

    load()
    return () => controller.abort()
  }, [from, to, platform, region, country])

  const countryOptions = useMemo(() => geoOptions.countriesByRegion[region] ?? [], [geoOptions, region])

  const currentAgg = useMemo(() => aggregateByCurrency(rows), [rows])
  const previousAgg = useMemo(() => (previousRows ? aggregateByCurrency(previousRows) : null), [previousRows])

  const currencies = useMemo(
    () => (Object.keys(currentAgg.spend).length > 0 ? Object.keys(currentAgg.spend).sort() : ['USD']),
    [currentAgg]
  )

  const dealsRate = (leadsTotal: number, dealsCount: number): number | null =>
    leadsTotal > 0 ? (dealsCount / leadsTotal) * 100 : null

  const currentValidationRate = kpis ? dealsRate(kpis.leadsTotal, kpis.dealsCount) : null
  const previousValidationRate = previousKpis ? dealsRate(previousKpis.leadsTotal, previousKpis.dealsCount) : null

  const sortedRows = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => (sortDirection === 'desc' ? b.spend - a.spend : a.spend - b.spend))
    return copy
  }, [rows, sortDirection])

  return (
    <div style={{ background: T.bg, minHeight: '100vh', fontFamily: 'Roboto, system-ui, sans-serif', color: T.ink }}>
      <button
        onClick={cycleLanguage}
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 20,
          border: `1px solid ${T.border}`,
          background: T.surface,
          borderRadius: 999,
          padding: '6px 14px',
          fontSize: 12,
          fontWeight: 600,
          color: T.brand600,
          cursor: 'pointer',
          boxShadow: T.shadow4,
        }}
      >
        {LANGUAGES.map((l) => l.toUpperCase()).join(' / ')} · {language.toUpperCase()}
      </button>

      <RegionSidebar
        active={region}
        onChange={(r) => {
          setRegion(r)
          setCountry('all')
        }}
      />

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 24px 96px 208px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: T.ink, marginBottom: 16 }}>{t('page.title')}</h1>

        <section
          style={{
            display: 'flex',
            gap: 20,
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            background: T.surface,
            borderRadius: 16,
            border: `1px solid ${T.border}`,
            boxShadow: T.shadow4,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: T.inkFaint }}>
            {t('filters.dateFrom')}
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: T.inkFaint }}>
            {t('filters.dateTo')}
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
          </label>

          <PlatformFilterPill
            active={platform}
            onChange={setPlatform}
            label={t('filters.platform')}
            allLabel={t('filters.platform.all')}
            otherLabel={t('filters.platform.other')}
          />

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: T.inkFaint }}>
            {t('filters.country')}
            <select value={country} onChange={(e) => setCountry(e.target.value)} style={inputStyle}>
              <option value="all">{t('filters.country.all')}</option>
              {countryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </section>

        {error && (
          <div
            style={{
              borderRadius: 16,
              border: `1px solid ${ACCENT.purple}55`,
              background: '#fbe9e9',
              padding: 16,
              fontSize: 13,
              color: '#8a2a2a',
              marginBottom: 24,
            }}
          >
            {t('errors.loadFailed')} {error}
          </div>
        )}

        {loading && !error && (
          <div
            style={{
              borderRadius: 16,
              border: `1px solid ${T.border}`,
              background: T.surface,
              padding: 16,
              fontSize: 13,
              color: T.inkSoft,
              marginBottom: 24,
            }}
          >
            {t('state.loading')}
          </div>
        )}

        {!loading && !error && platform === 'all' && <OverviewSection overview={overview} t={t} />}

        {!loading && !error && platform === 'other' && (
          <LeadsAttributionSection leadsAttribution={leadsAttribution} t={t} />
        )}

        {!loading && !error && platform !== 'all' && platform !== 'other' && (
          <>
            <section
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 16,
                marginBottom: 24,
              }}
            >
              {currencies.map((curr, i) => (
                <SummaryCard
                  key={`spend-${curr}`}
                  label={`${t('summary.totalSpend')} ${curr}`}
                  value={currentAgg.spend[curr] ?? 0}
                  formatValue={(v) => formatCurrency(v, curr)}
                  glowColor={CURRENCY_COLOR[curr] ?? ACCENT.teal}
                  changePct={previousAgg ? pctChange(currentAgg.spend[curr] ?? 0, previousAgg.spend[curr] ?? 0) : null}
                  index={i}
                />
              ))}

              <SummaryCard
                label={t('summary.leads')}
                value={kpis?.leadsTotal ?? 0}
                formatValue={(v) => Math.round(v).toLocaleString('pt-BR')}
                glowColor={ACCENT.teal}
                changePct={previousKpis ? pctChange(kpis?.leadsTotal ?? 0, previousKpis.leadsTotal) : null}
                index={currencies.length}
              />

              {currencies.map((curr, i) => {
                const leadsForCurrency = currentAgg.leads[curr] ?? 0
                const spendForCurrency = currentAgg.spend[curr] ?? 0
                const cplValue = leadsForCurrency > 0 ? spendForCurrency / leadsForCurrency : 0
                const prevLeads = previousAgg?.leads[curr] ?? 0
                const prevSpend = previousAgg?.spend[curr] ?? 0
                const prevCpl = prevLeads > 0 ? prevSpend / prevLeads : null
                return (
                  <SummaryCard
                    key={`cpl-${curr}`}
                    label={`${t('summary.cplAvg')} ${curr}`}
                    value={cplValue}
                    formatValue={(v) => formatNumber(v)}
                    glowColor={CURRENCY_COLOR[curr] ?? ACCENT.teal}
                    changePct={previousAgg ? pctChange(cplValue, prevCpl) : null}
                    index={currencies.length + 1 + i}
                  />
                )
              })}

              <SummaryCard
                label={t('summary.validatedDeals')}
                value={kpis?.dealsCount ?? 0}
                formatValue={(v) => Math.round(v).toLocaleString('pt-BR')}
                glowColor={ACCENT.purple}
                changePct={previousKpis ? pctChange(kpis?.dealsCount ?? 0, previousKpis.dealsCount) : null}
                index={2 * currencies.length + 1}
              />

              <SummaryCard
                label={t('summary.validationRate')}
                value={currentValidationRate ?? 0}
                formatValue={(v) => `${v.toFixed(1)}%`}
                glowColor={ACCENT.cyanDim}
                changePct={
                  currentValidationRate !== null && previousValidationRate !== null
                    ? pctChange(currentValidationRate, previousValidationRate)
                    : null
                }
                index={2 * currencies.length + 2}
              />
            </section>

            <section
              style={{
                overflowX: 'auto',
                borderRadius: 16,
                border: `1px solid ${T.border}`,
                background: T.surface,
                boxShadow: T.shadow4,
              }}
            >
              <table style={{ width: '100%', minWidth: 720, textAlign: 'left', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}`, color: T.inkFaint }}>
                    <th style={{ padding: '10px 16px' }}>{t('table.currency')}</th>
                    <th style={{ padding: '10px 16px' }}>{t('table.platform')}</th>
                    <th style={{ padding: '10px 16px' }}>{t('table.campaign')}</th>
                    <th style={{ padding: '10px 16px' }}>{t('table.leads')}</th>
                    <th style={{ padding: '10px 16px' }}>{t('table.cpl')}</th>
                    <th style={{ padding: '10px 16px' }}>{t('table.sql')}</th>
                    <th style={{ padding: '10px 16px' }}>{t('table.cpsql')}</th>
                    <th style={{ padding: '10px 16px' }}>{t('table.opportunity')}</th>
                    <th style={{ padding: '10px 16px' }}>{t('table.cpopportunity')}</th>
                    <th style={{ padding: '10px 16px' }}>{t('table.customer')}</th>
                    <th style={{ padding: '10px 16px' }}>{t('table.cpcustomer')}</th>
                    <th
                      style={{ padding: '10px 16px', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => setSortDirection((d) => (d === 'desc' ? 'asc' : 'desc'))}
                    >
                      {t('table.spend')} {sortDirection === 'desc' ? '↓' : '↑'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.length === 0 ? (
                    <tr>
                      <td colSpan={12} style={{ padding: '24px 16px', textAlign: 'center', color: T.inkFaint }}>
                        {t('table.empty')}
                      </td>
                    </tr>
                  ) : (
                    sortedRows.map((row) => (
                      <tr key={`${row.campaign_id}-${row.currency}`} style={{ borderBottom: `1px solid ${T.border}` }}>
                        <td style={{ padding: '10px 16px' }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              letterSpacing: 0.4,
                              color: CURRENCY_COLOR[row.currency] ?? T.inkSoft,
                              border: `1px solid ${(CURRENCY_COLOR[row.currency] ?? T.inkFaint)}55`,
                              borderRadius: 6,
                              padding: '2px 6px',
                            }}
                          >
                            {row.currency}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              fontWeight: 600,
                              color: PLATFORM_COLOR[row.platform],
                            }}
                          >
                            <span
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: 999,
                                background: PLATFORM_COLOR[row.platform],
                              }}
                            />
                            {PLATFORM_LABELS[row.platform]}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px' }}>{row.campaign_name}</td>
                        <td style={{ padding: '10px 16px', fontVariantNumeric: 'tabular-nums' }}>{row.leads}</td>
                        <td style={{ padding: '10px 16px', fontVariantNumeric: 'tabular-nums' }}>
                          {row.cpl !== null ? formatNumber(row.cpl) : '—'}
                        </td>
                        <td style={{ padding: '10px 16px', fontVariantNumeric: 'tabular-nums' }}>{row.sql}</td>
                        <td style={{ padding: '10px 16px', fontVariantNumeric: 'tabular-nums' }}>
                          {row.cpsql !== null ? formatNumber(row.cpsql) : '—'}
                        </td>
                        <td style={{ padding: '10px 16px', fontVariantNumeric: 'tabular-nums' }}>{row.opportunity}</td>
                        <td style={{ padding: '10px 16px', fontVariantNumeric: 'tabular-nums' }}>
                          {row.cpopportunity !== null ? formatNumber(row.cpopportunity) : '—'}
                        </td>
                        <td style={{ padding: '10px 16px', fontVariantNumeric: 'tabular-nums' }}>{row.customer}</td>
                        <td style={{ padding: '10px 16px', fontVariantNumeric: 'tabular-nums' }}>
                          {row.cpcustomer !== null ? formatNumber(row.cpcustomer) : '—'}
                        </td>
                        <td style={{ padding: '10px 16px', fontVariantNumeric: 'tabular-nums' }}>
                          {formatNumber(row.spend)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
