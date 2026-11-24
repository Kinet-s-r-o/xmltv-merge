# Layout and Navigation — Kinet UI/UX

## 1. Application shell

```
<div class="app-shell">
  <aside class="app-sidebar">…brand / nav / footer…</aside>
  <div class="app-main">
    <header class="topbar">…</header>
    <main class="content-area">…page…</main>
  </div>
</div>
```

- `.app-shell`: flex, `min-height: 100vh` (100dvh mobile), `--bg-base`.
- Desktop (≥1024px): sidebar fixed; `.app-main` gets `padding-left: 256px` (64px when collapsed).
- Mobile (<1024px): sidebar is an off-canvas drawer (`translateX(-100%)` → `.is-open`), scrim behind it, `min(88vw, 320px)` wide, safe-area padding.

## 2. Sidebar

| Part | Spec |
| --- | --- |
| Width | 256px (64px collapsed; `min(88vw, 320px)` mobile) |
| Background | `--bg-sidebar`; collapsed: `--bg-sidebar/.42` + `backdrop-filter: blur(8px)` |
| Border | 1px right `--border-default` |
| Brand row | 72px min-height, `14px 16px`, 1px `--border-subtle` bottom border |
| Brand mark | 34×34px, 1px `--accent/.7` border, `--accent/.1` fill, 3px radius, three ascending bars (7/13/19px) |
| Brand name | 16px/650, `-.015em`; subtitle 9px muted |
| Nav padding | `14px 10px`; group gap 18px |
| Section label | 11px/500 muted, `margin: 0 10px 6px` |
| Nav link | 36px min-height, `0 10px`, gap 10px, 13px/500, `--text-secondary`, 3px radius, transparent 1px border |
| Nav link hover | `--text-primary` on `--bg-hover` |
| Nav link active | `--accent-hover` text, `--nav-active-bg` fill, `--nav-active-border` border, accent ChevronRight |
| Submenu | `padding: 2px 0 2px 27px`; items 30px min-height, 12px/400 muted |
| Footer | operator card (30px avatar, `--accent/.16` bg, initials 11px/700), role line 10px muted, sign-out icon-button; meta row 9px (app name + version) |
| Collapse toggle | 32px icon-button; desktop only; persisted in `localStorage` |
| Mobile close | 32px icon-button in brand row; Escape closes and returns focus to the menu button |

**Navigation model:** data-driven groups (e.g. "Monitor", "Control") with section labels; items filtered by permission (`canVisit(section)`); `aria-current="page"` on the active link; expandable submenus with `aria-expanded` and a rotating chevron.

## 3. Topbar

- 58px sticky, `z-30`, `--bg-base`, 1px `--border-subtle` bottom border; padding `0 14px` (24px desktop).
- Left: mobile menu button (44px target) + kicker (9px mono, `--text-muted`, `.04em`) + title (14px/600).
- Right: service-state pill (30px, success/error tinted, icon + text, `aria-live="polite"`) + theme switcher (32px icon-button cycling dark→light→system with Sun/Moon/Monitor icons).

## 4. Content area

- `max-width: 1680px`, centered, `width: 100%`.
- Padding: `16px 12px 32px` (<640) → `20px 18px 40px` (≥640) → `24px 24px 48px` (≥1024); mobile adds safe-area bottom.
- Direct children get `min-width: 0` on mobile.

## 5. Page composition pattern

1. `PageHeader` (title + description + primary actions).
2. Optional operational register (decision metrics with freshness).
3. `data-panel` / `table-panel` regions (toolbar + table + pagination).
4. Dialogs and notifications via the shared providers.

## 6. Dashboard layouts

- **Ops register:** 1px grid-line technique; 2-col mobile, 3–4-col small, 6-col desktop (fault/task registers).
- **Health grid:** auto-fit `minmax(280px, 1fr)` at ≥1024px; 3-col at ≥1536px.
- **Distribution lists:** label + 12px progress bar + mono value.
- **Ops attention list:** 3-col (1 mobile) grid of links with accent icons.
- **Fleet dashboard grid (app-specific):** 120-column × 8px-row dense grid with user drag/resize; per-user layout persisted. Do not generalize.

## 7. Responsive contract

| Breakpoint | Behavior |
| --- | --- |
| <640px | Off-canvas sidebar; stacked page header; 2-col registers; 44px controls; 48px nav links; bottom-sheet dialogs; sticky first table column; `scroll-padding-top` for the sticky topbar |
| ≥640px | Service pill visible; 3–4-col registers; 2-col panel grids |
| ≥1024px | Fixed collapsible sidebar; 24px content padding; 6-col task register; side-panel dialogs expand inline |
| ≥1536px | 3-col health grid |
| Landscape short | Table scroll max-height removed |
| Coarse pointer | 44px resize handles and boolean indicators |

**Rules:** no hover-only behavior; essential actions stay visible; identifiers stay visible during horizontal scroll; complete task and recovery support on mobile.

## 8. Z-index layering

content (0) < sticky in-page header (20) < topbar (30) < scrim (40) < sidebar (50/60) < dialog (100) < table dropdowns (110) < notifications (120).

## 9. Motion

- Sidebar/drawer: 180ms ease.
- Page/section transitions: opt-in (fade / slide / fade-slide, 150–600ms), default off, applied to `.content-area` children; honors `prefers-reduced-motion`.
- Theme switch: 160ms.
