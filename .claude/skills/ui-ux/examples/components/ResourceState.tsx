/**
 * Kinet UI/UX — resource state example (SolidJS).
 *
 * Contract (see references/components.md §Resource states):
 * - one component for loading / empty / error / success states
 * - loading: spinner + "Loading…" (or skeleton rows in tables)
 * - empty: concrete, domain-specific copy ("No devices match the current filters")
 * - error: error icon, message, and a retry action when the operation is retryable
 * - never a bare "Something went wrong"
 */
import { Show } from 'solid-js';

interface ResourceStateProps {
  state: 'loading' | 'empty' | 'error' | 'ready';
  title: string;
  message?: string;
  compact?: boolean;
  onRetry?: () => void;
  children?: JSX.Element;
}

export function ResourceState(props: ResourceStateProps) {
  return (
    <Show when={props.state !== 'ready'} fallback={props.children}>
      <div class={`resource-state${props.compact ? ' is-compact' : ''}`}>
        <Show when={props.state === 'loading'}>
          <div class="resource-state-icon" aria-hidden="true">
            <div class="spinner" />
          </div>
          <strong>{props.title}</strong>
          <Show when={props.message}>
            <p>{props.message}</p>
          </Show>
        </Show>
        <Show when={props.state === 'empty'}>
          <div class="resource-state-icon" aria-hidden="true">∅</div>
          <strong>{props.title}</strong>
          <Show when={props.message}>
            <p>{props.message}</p>
          </Show>
        </Show>
        <Show when={props.state === 'error'}>
          <div class="resource-state-icon" aria-hidden="true">!</div>
          <strong>{props.title}</strong>
          <Show when={props.message}>
            <p>{props.message}</p>
          </Show>
          <Show when={props.onRetry}>
            <div class="resource-state-actions">
              <button class="btn btn-secondary" onClick={props.onRetry}>
                Retry
              </button>
            </div>
          </Show>
        </Show>
      </div>
    </Show>
  );
}
