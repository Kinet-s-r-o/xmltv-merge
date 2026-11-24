/**
 * Kinet UI/UX — page header example (SolidJS).
 *
 * Contract (see references/components.md §Page header):
 * - 20px/620 title, 12px muted description, 1px bottom border
 * - right-aligned tool row (filters, actions) that wraps on mobile
 * - every page starts with this header; no page-level hero sections
 */
import { Show } from 'solid-js';

interface PageHeaderProps {
  title: string;
  description?: string;
  tools?: () => JSX.Element;
}

export function PageHeader(props: PageHeaderProps) {
  return (
    <header class="page-header">
      <div class="page-header-copy">
        <h1>{props.title}</h1>
        <Show when={props.description}>
          <p>{props.description}</p>
        </Show>
      </div>
      <Show when={props.tools}>
        <div class="page-header-tools">{props.tools?.()}</div>
      </Show>
    </header>
  );
}
