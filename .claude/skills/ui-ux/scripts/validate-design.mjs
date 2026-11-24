#!/usr/bin/env node
/**
 * Kinet UI/UX design-system validator.
 *
 * Self-contained, dependency-free Node script. Runs objective design-consistency
 * checks against a frontend source tree. Subjective quality (copy, product fit,
 * visual similarity) is intentionally NOT scored here — see references/validation.md.
 *
 * Usage:
 *   node validate-design.mjs <path-to-frontend-src> [--allow-hex <file1,file2>]
 *
 * Exit code 0 = no violations (warnings may be printed).
 * Exit code 1 = one or more violations.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const flagValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const srcArg = positional[0];
if (!srcArg) {
  console.error('Usage: node validate-design.mjs <path-to-frontend-src> [--allow-hex <file1,file2>]');
  process.exit(2);
}
const sourceRoot = resolve(process.cwd(), srcArg);

// Files where raw hex is acceptable (chart/visualization internals).
const allowHex = new Set(
  (flagValue('--allow-hex') ?? 'OntLanVisualization.css,MetricChart.tsx,HealthGauge.tsx,DeviceGrowthChart.tsx,InterfaceMetricChart.tsx,IperfResult.tsx,ColorSwatch.tsx')
    .split(',').map((s) => s.trim()).filter(Boolean),
);

const violations = [];
const warnings = [];
const addViolation = (rel, line, msg) => violations.push(`${rel}:${line} ${msg}`);
const addWarning = (rel, line, msg) => warnings.push(`${rel}:${line} ${msg}`);

const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.vite') continue;
      out.push(...(await walk(path)));
    } else {
      out.push(path);
    }
  }
  return out;
};

const lineNumber = (source, index) => source.slice(0, index).split('\n').length;
const reportMatches = (rel, source, pattern, message, { warn = false } = {}) => {
  for (const match of source.matchAll(pattern)) {
    const line = lineNumber(source, match.index ?? 0);
    (warn ? addWarning : addViolation)(rel, line, message);
  }
};

const files = (await walk(sourceRoot)).filter((p) => ['.css', '.ts', '.tsx'].includes(extname(p)));

for (const path of files) {
  const rel = path.slice(sourceRoot.length + 1).replace(/\\/g, '/');
  const source = await readFile(path, 'utf8');
  const isCss = extname(path) === '.css';
  const isTsx = extname(path) === '.tsx';
  const hexAllowed = allowHex.has(basename(path));

  // 1. Prohibited generic font.
  reportMatches(rel, source, /\bInter\b/g, 'uses the prohibited generic Inter font');

  // 2. Prohibited purple-family visual tokens.
  reportMatches(rel, source, /\b(?:purple|violet|indigo)(?:-|\b)/gi, 'uses a prohibited default purple-family visual token');

  // 2b. Palette-shade utilities instead of semantic theme colors.
  reportMatches(rel, source, /\b(?:text|bg|border|accent|ring|outline|fill|stroke|divide|decoration|from|via|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|rose|pink|fuchsia)-\d{2,3}\b/g, 'uses a palette utility instead of a semantic theme color');

  // 3. Native blocking dialogs.
  reportMatches(rel, source, /\b(?:window|globalThis)\.(?:alert|confirm)\s*\(/g, 'uses a native blocking dialog instead of shared feedback');
  reportMatches(rel, source, /(^|[^.\w])alert\s*\(/gm, 'uses a native blocking alert instead of shared feedback');

  // 4. Click handler on a non-interactive element.
  reportMatches(rel, source, /<(?:div|span|tr|li)\b(?![^>]*\brole=["']button["'])[^>]*\bonClick\s*=/g, 'uses a click handler on a non-interactive element');

  // 5. Inline style instead of a token or reusable class.
  for (const match of source.matchAll(/<[A-Za-z][^>]*\bstyle\s*=/g)) {
    if (!match[0].includes('data-dynamic-style')) {
      addViolation(rel, lineNumber(source, match.index ?? 0), 'uses an inline style instead of a design token or reusable class');
    }
  }

  // 6. Raw hex color in UI CSS (warning; chart/visualization files are allowlisted).
  if (isCss && !hexAllowed) {
    for (const match of source.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      addWarning(rel, lineNumber(source, match.index ?? 0), `raw hex color ${match[0]} — prefer a semantic token (review)`);
    }
  }

  if (isTsx) {
    // 7. Label association.
    for (const match of source.matchAll(/<label\b([^>]*)>/g)) {
      const openingTag = match[0];
      const start = (match.index ?? 0) + openingTag.length;
      const end = source.indexOf('</label>', start);
      const body = end >= 0 ? source.slice(start, end) : '';
      const hasFor = /\bfor\s*=/.test(openingTag);
      const wrapsControl = /<(?:input|select|textarea)\b/.test(body);
      if (!hasFor && !wrapsControl) {
        addViolation(rel, lineNumber(source, match.index ?? 0), 'has a label that is not associated with an input');
      }
    }

    // 8. Data tables must use the data-table class.
    reportMatches(rel, source, /<table\b(?![^>]*\bclass="[^"]*\bdata-table\b)[^>]*>/g, 'has a data table without the responsive data-table behavior');
  }
}

// 9-14. Stylesheet-level checks against the main stylesheet.
const cssFiles = files.filter((p) => extname(p) === '.css');
const mainCssPath = cssFiles.find((p) => basename(p) === 'index.css') ?? cssFiles[0];
if (mainCssPath) {
  const css = await readFile(mainCssPath, 'utf8');
  const rel = mainCssPath.slice(sourceRoot.length + 1).replace(/\\/g, '/');

  // 10. Focus visibility.
  if (!/:focus-visible/.test(css)) addViolation(rel, 1, 'is missing a :focus-visible focus outline rule');

  // 11. Reduced motion.
  if (!/prefers-reduced-motion/.test(css)) addViolation(rel, 1, 'is missing a prefers-reduced-motion rule');

  // 14. Control radius token.
  if (!/--radius-control:\s*3px/.test(css)) addViolation(rel, 1, 'is missing the --radius-control: 3px token');

  // 13. Z-index ceiling.
  for (const match of css.matchAll(/z-index:\s*(\d+)/g)) {
    const value = Number(match[1]);
    if (value > 120) addViolation(rel, lineNumber(css, match.index ?? 0), `z-index ${value} exceeds the documented ceiling of 120`);
  }

  // 12. Primary action contrast (white on --action-primary) >= 4.5:1.
  const actionColor = css.match(/--action-primary:\s*(\d+)\s+(\d+)\s+(\d+)/);
  if (!actionColor) {
    addViolation(rel, 1, 'is missing the --action-primary semantic token');
  } else {
    const luminance = (values) => {
      const channels = values.map((value) => {
        const normalized = value / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const foreground = luminance([255, 255, 255]);
    const background = luminance(actionColor.slice(1).map(Number));
    const contrast = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    if (contrast < 4.5) addViolation(rel, 1, `primary action contrast is ${contrast.toFixed(2)}:1; WCAG AA requires 4.5:1`);
  }
}

// 9. Dialog contract (if the shared Dialog component exists).
const dialogFile = files.find((p) => basename(p) === 'Dialog.tsx' || basename(p) === 'Dialog.ts');
if (dialogFile) {
  const dialog = await readFile(dialogFile, 'utf8');
  const rel = dialogFile.slice(sourceRoot.length + 1).replace(/\\/g, '/');
  for (const requirement of ['role="dialog"', 'aria-modal="true"', "event.key === 'Escape'", 'previouslyFocused?.focus()']) {
    if (!dialog.includes(requirement)) addViolation(rel, 1, `accessible dialog requirement is missing: ${requirement}`);
  }
}

// Report.
if (warnings.length > 0) {
  console.log(`\nDesign warnings (${warnings.length}) — review, not blocking:`);
  for (const w of warnings) console.log(`  ~ ${w}`);
}

if (violations.length > 0) {
  console.error('\nKinet UI/UX design gate FAILED:');
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log(`Kinet UI/UX design gate passed (${files.length} source files checked, ${warnings.length} warnings).`);
