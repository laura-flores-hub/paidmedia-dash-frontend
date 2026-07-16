export const T = {
  bg: '#f5f6f8',
  surface: '#ffffff',
  ink: '#303036',
  inkSoft: '#636271',
  inkFaint: '#aaaaba',
  border: '#eeeef1',
  brand50: '#f1f4fd',
  brand100: '#dee5fb',
  brand400: '#6f93eb',
  brand500: '#496be3',
  brand600: '#3851d8',
  brand900: '#29317f',
  shadow4: '-1px 4px 8px 0px rgba(233,233,244,1)',
  shadow8: '-1px 8px 16px 0px rgba(170,170,186,0.45)',
} as const

export const ACCENT = {
  cyan: '#6fd1e7',
  cyanDim: '#46badd',
  purple: '#9785ff',
  teal: '#35a48e',
} as const

export const CURRENCY_COLOR: Record<string, string> = {
  USD: ACCENT.cyan,
  ARS: ACCENT.purple,
}

export const PLATFORM_COLOR: Record<'meta' | 'google' | 'linkedin', string> = {
  meta: ACCENT.cyan,
  google: ACCENT.purple,
  linkedin: ACCENT.cyanDim,
}

export const EASE = [0.16, 1, 0.3, 1] as const
export const SPRING = { type: 'spring', stiffness: 120, damping: 18 } as const
