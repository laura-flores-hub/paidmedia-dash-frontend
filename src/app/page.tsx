'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useInView, useMotionValue, animate as fmAnimate } from 'framer-motion'
import type { CampaignSummary, GeoOptions, Platform } from '@/types/paid-media'
import { useLanguage } from '@/lib/useLanguage'
import { LANGUAGES } from '@/lib/i18n'
import { ACCENT, CURRENCY_COLOR, EASE, PLATFORM_COLOR, SPRING, T } from '@/lib/tokens'

type SortDirection = 'asc' | 'desc'

const PLATFORM_LABELS: Record<Platform, string> = {
  google: 'Google',
  meta: 'Meta',
  linkedin: 'LinkedIn',
}
const PLATFORM_OPTIONS: Array<Platform | 'all'> = ['all', 'google', 'meta', 'linkedin']

function formatCurrency(value: number, currency: string) {
  return `${currency} ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function AnimatedNumber({ value, currency }: { value: number; currency: string }) {
  const mv = useMotionValue(0)
  const [display, setDisplay] = useState(formatCurrency(0, currency))

  useEffect(() => {
    const controls = fmAnimate(mv, value, {
      duration: 1.0,
      ease: EASE,
      onUpdate: (latest) => setDisplay(formatCurrency(latest, currency)),
    })
    return () => controls.stop()
  }, [value, currency])

  return <span>{display}</span>
}

function SummaryCard({ label, value, currency, index }: { label: string; value: number; currency: string; index: number }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const glow = CURRENCY_COLOR[currency] ?? ACCENT.teal

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
          background: `radial-gradient(circle, ${glow}14, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />
      <div style={{ fontSize: 12, letterSpacing: 0.2, color: T.inkFaint, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, lineHeight: 1.3, fontWeight: 600, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>
        <AnimatedNumber value={value} currency={currency} />
      </div>
    </motion.div>
  )
}

function PlatformFilterPill({
  active,
  onChange,
  label,
}: {
  active: Platform | 'all'
  onChange: (p: Platform | 'all') => void
  label: string
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
        {PLATFORM_OPTIONS.map((p) => {
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
                    background: p === 'all' ? T.brand500 : PLATFORM_COLOR[p],
                    borderRadius: 999,
                    zIndex: -1,
                  }}
                />
              )}
              {p === 'all' ? label : PLATFORM_LABELS[p]}
            </button>
          )
        })}
      </div>
    </div>
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

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [platform, setPlatform] = useState<Platform | 'all'>('all')
  const [region, setRegion] = useState('all')
  const [country, setCountry] = useState('all')

  const [rows, setRows] = useState<CampaignSummary[]>([])
  const [geoOptions, setGeoOptions] = useState<GeoOptions>({ regions: [], countriesByRegion: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (platform !== 'all') params.set('platform', platform)
      if (region !== 'all') params.set('region', region)
      if (country !== 'all') params.set('country', country)

      try {
        const res = await fetch(`/api/paid-media?${params.toString()}`, {
          signal: controller.signal,
        })
        const body = await res.json()

        if (!res.ok) {
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }

        setRows(body.data)
        setGeoOptions(body.meta.geoOptions)
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Erro desconhecido ao buscar dados.')
        setRows([])
      } finally {
        setLoading(false)
      }
    }

    load()
    return () => controller.abort()
  }, [from, to, platform, region, country])

  const countryOptions = useMemo(() => {
    if (region === 'all') {
      const all = new Set<string>()
      Object.values(geoOptions.countriesByRegion).forEach((list) => list.forEach((c) => all.add(c)))
      return [...all].sort()
    }
    return geoOptions.countriesByRegion[region] ?? []
  }, [geoOptions, region])

  const totalsByCurrency = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const row of rows) {
      totals[row.currency] = (totals[row.currency] ?? 0) + row.spend
    }
    return totals
  }, [rows])

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

      <main style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 24px 96px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: T.ink, marginBottom: 24 }}>{t('page.title')}</h1>

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

          <PlatformFilterPill active={platform} onChange={setPlatform} label={t('filters.platform')} />

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: T.inkFaint }}>
            {t('filters.region')}
            <select
              value={region}
              onChange={(e) => {
                setRegion(e.target.value)
                setCountry('all')
              }}
              style={inputStyle}
            >
              <option value="all">{t('filters.region.all')}</option>
              {geoOptions.regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

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

        {!loading && !error && (
          <>
            <section
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 16,
                marginBottom: 24,
              }}
            >
              {Object.entries(totalsByCurrency).length === 0 ? (
                <SummaryCard label={t('summary.totalUsd')} value={0} currency="USD" index={0} />
              ) : (
                Object.entries(totalsByCurrency).map(([currency, value], i) => (
                  <SummaryCard
                    key={currency}
                    label={currency === 'USD' ? t('summary.totalUsd') : currency === 'ARS' ? t('summary.totalArs') : `Total ${currency}`}
                    value={value}
                    currency={currency}
                    index={i}
                  />
                ))
              )}
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
                    <th style={{ padding: '10px 16px' }}>{t('table.platform')}</th>
                    <th style={{ padding: '10px 16px' }}>{t('table.campaign')}</th>
                    <th style={{ padding: '10px 16px' }}>{t('table.currency')}</th>
                    <th style={{ padding: '10px 16px' }}>{t('table.region')}</th>
                    <th style={{ padding: '10px 16px' }}>{t('table.countries')}</th>
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
                      <td colSpan={6} style={{ padding: '24px 16px', textAlign: 'center', color: T.inkFaint }}>
                        {t('table.empty')}
                      </td>
                    </tr>
                  ) : (
                    sortedRows.map((row) => (
                      <tr key={`${row.campaign_id}-${row.currency}`} style={{ borderBottom: `1px solid ${T.border}` }}>
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
                        <td style={{ padding: '10px 16px', color: T.inkSoft }}>{row.region ?? '—'}</td>
                        <td style={{ padding: '10px 16px', color: T.inkSoft }}>
                          {row.countries.length > 0 ? row.countries.join(', ') : '—'}
                        </td>
                        <td style={{ padding: '10px 16px', fontVariantNumeric: 'tabular-nums' }}>
                          {formatCurrency(row.spend, row.currency)}
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
