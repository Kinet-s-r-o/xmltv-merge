export type ThemePreference = 'dark' | 'light' | 'system'
export type ResolvedTheme = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'xmltv-theme'
const ORDER: ThemePreference[] = ['dark', 'light', 'system']

export function readThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'light' || value === 'system' || value === 'dark' ? value : 'dark'
  } catch {
    return 'dark'
  }
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/** Applies data-theme="dark" | "light" on <html> and persists the preference. */
export function applyTheme(preference: ThemePreference) {
  document.documentElement.dataset.theme = resolveTheme(preference)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Storage can be unavailable; the applied theme still holds for this page.
  }
}

export function nextTheme(preference: ThemePreference): ThemePreference {
  return ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length]
}
