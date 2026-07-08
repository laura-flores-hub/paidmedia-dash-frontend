'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Platform, PaidMediaRow } from '@/types/paid-media'

type SortDirection = 'asc' | 'desc'

const PLATFORM_LABELS: Record<Platform, string> = {
  google: 'Google',
  meta: 'Meta',
  linkedin: 'LinkedIn',
}

export default function Home() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [platform, setPlatform] = useState<Platform | 'all'>('all')

  const [rows, setRows] = useState<PaidMediaRow[]>([])
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

      try {
        const res = await fetch(`/api/paid-media?${params.toString()}`, {
          signal: controller.signal,
        })
        const body = await res.json()

        if (!res.ok) {
          throw new Error(body.error ?? `Erro HTTP ${res.status}`)
        }

        setRows(body.data)
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
  }, [from, to, platform])

  const totals = useMemo(() => {
    const byPlatform: Record<Platform, number> = { google: 0, meta: 0, linkedin: 0 }
    let total = 0

    for (const row of rows) {
      byPlatform[row.platform] += row.spend
      total += row.spend
    }

    return { total, byPlatform }
  }, [rows])

  const sortedRows = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => (sortDirection === 'desc' ? b.spend - a.spend : a.spend - b.spend))
    return copy
  }, [rows, sortDirection])

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 dark:bg-black sm:px-8">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Paid Media Dashboard
        </h1>

        <section className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-end sm:gap-6">
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            De
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Até
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Plataforma
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform | 'all')}
              className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="all">Todas</option>
              <option value="google">Google</option>
              <option value="meta">Meta</option>
              <option value="linkedin">LinkedIn</option>
            </select>
          </label>
        </section>

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            Erro ao carregar dados: {error}
          </div>
        )}

        {loading && !error && (
          <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            Carregando...
          </div>
        )}

        {!loading && !error && (
          <>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Spend total</p>
                <p className="text-xl font-semibold text-black dark:text-zinc-50">
                  {formatCurrency(totals.total)}
                </p>
              </div>
              {(['google', 'meta', 'linkedin'] as Platform[]).map((p) => (
                <div
                  key={p}
                  className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">{PLATFORM_LABELS[p]}</p>
                  <p className="text-xl font-semibold text-black dark:text-zinc-50">
                    {formatCurrency(totals.byPlatform[p])}
                  </p>
                </div>
              ))}
            </section>

            <section className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th className="px-4 py-2">Plataforma</th>
                    <th className="px-4 py-2">Campanha</th>
                    <th className="px-4 py-2">Data</th>
                    <th
                      className="cursor-pointer select-none px-4 py-2"
                      onClick={() =>
                        setSortDirection((d) => (d === 'desc' ? 'asc' : 'desc'))
                      }
                    >
                      Spend {sortDirection === 'desc' ? '↓' : '↑'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-zinc-500 dark:text-zinc-400">
                        Nenhum dado encontrado para os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    sortedRows.map((row, i) => (
                      <tr
                        key={`${row.platform}-${row.campaign_id}-${row.date}-${i}`}
                        className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
                      >
                        <td className="px-4 py-2">{PLATFORM_LABELS[row.platform]}</td>
                        <td className="px-4 py-2">{row.campaign_name}</td>
                        <td className="px-4 py-2">{row.date}</td>
                        <td className="px-4 py-2">{formatCurrency(row.spend)}</td>
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

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
