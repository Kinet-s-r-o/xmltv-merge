/**
 * Kinet UI/UX — chart theme hook (SolidJS + ECharts).
 *
 * Contract (see references/charts.md §1):
 * - All ECharts components call useChartTheme() and invoke the returned
 *   function inside their reactive option builder (createEffect / buildOption).
 * - The hook tracks the resolved-theme signal, so mounted charts re-theme
 *   automatically when the theme changes — no MutationObserver needed.
 * - Structural colors (text, labels, axes, grid, track, tooltip) come from
 *   root semantic tokens. Series palette and gauge preset zone colors stay
 *   hardcoded (user-configurable / visual presets) — do not tokenize them.
 *
 * Requires a useTheme() hook that exposes a reactive `theme` signal and
 * applies the DOM palette (data-theme attribute) BEFORE notifying reactive
 * consumers, so getComputedStyle() already reflects the new theme.
 */
import { useTheme } from './theme';

export const useChartTheme = () => {
  const { theme } = useTheme();
  return () => {
    // Track the resolved theme so the option builder re-runs on change.
    theme();
    const styles = getComputedStyle(document.documentElement);
    const color = (token: string) => `rgb(${styles.getPropertyValue(token).trim()})`;
    const text = color('--text-primary');
    const label = color('--text-muted');
    const border = color('--border-default');
    const surface = color('--bg-surface');
    return {
      text,
      label,
      border,
      surface,
      grid: color('--border-subtle'),
      track: color('--bg-elevated'),
      accent: color('--accent'),
      success: color('--success'),
      warning: color('--warning'),
      error: color('--error'),
      tooltip: { backgroundColor: surface, borderColor: border, textStyle: { color: text } },
    };
  };
};
