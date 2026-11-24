/**
 * Kinet UI/UX — accessible dialog example (SolidJS).
 *
 * Contract (see references/components.md §Dialog):
 * - role="dialog", aria-modal="true", labelled by its heading
 * - focus moves into the panel on open; focus is trapped; Escape closes
 * - focus returns to the previously focused element on close
 * - sizes: small 420 / medium 560 / large 880 / side panel 1120
 * - max-height min(760px, 100vh - 32px); body scrolls, header/footer stay fixed
 * - z-index 100 (below table dropdowns 110 and notifications 120)
 */
import { createSignal, onCleanup, onMount, Show } from 'solid-js';

type DialogSize = 'small' | 'medium' | 'large' | 'side';

interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  size?: DialogSize;
  onClose: () => void;
  actions?: () => JSX.Element;
  children: JSX.Element;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog(props: DialogProps) {
  const [panel, setPanel] = createSignal<HTMLElement>();
  const [previouslyFocused, setPreviouslyFocused] = createSignal<HTMLElement | null>(null);

  const focusFirst = () => {
    panel()?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      props.onClose();
      return;
    }
    if (event.key !== 'Tab' || !panel()) return;
    const focusable = Array.from(panel()!.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const restoreFocus = () => {
    previouslyFocused()?.focus();
  };

  onMount(() => {
    const onResize = () => {
      if (document.activeElement && !panel()?.contains(document.activeElement)) {
        focusFirst();
      }
    };
    window.addEventListener('resize', onResize);
    onCleanup(() => {
      window.removeEventListener('resize', onResize);
      restoreFocus();
    });
  });

  return (
    <Show when={props.open}>
      <div class="dialog-backdrop" role="presentation" onClick={() => props.onClose()}>
        <section
          ref={setPanel}
          class={`dialog-panel dialog-${props.size ?? 'medium'}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-title"
          onMount={() => {
            setPreviouslyFocused(document.activeElement as HTMLElement | null);
            focusFirst();
          }}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={handleKeyDown}
        >
          <header class="dialog-header">
            <div>
              <h2 id="dialog-title">{props.title}</h2>
              <Show when={props.description}>
                <p>{props.description}</p>
              </Show>
            </div>
            <button class="icon-button" aria-label="Close dialog" onClick={() => props.onClose()}>
              ✕
            </button>
          </header>
          <div class="dialog-content">
            <div class="dialog-body">{props.children}</div>
          </div>
          <Show when={props.actions}>
            <footer class="dialog-actions">{props.actions?.()}</footer>
          </Show>
        </section>
      </div>
    </Show>
  );
}
