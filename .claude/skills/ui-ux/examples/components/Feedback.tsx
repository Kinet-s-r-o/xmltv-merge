/**
 * Kinet UI/UX — notification stack example (SolidJS).
 *
 * Contract (see references/components.md §Notifications):
 * - fixed top-right stack, z-index 120 (above dialogs)
 * - success / error / info variants; error keeps the detail expandable
 * - auto-dismiss after 6s (success/info); errors stay until dismissed
 * - never use window.alert / window.confirm
 */
import { createSignal, For, Show } from 'solid-js';

type NoticeKind = 'success' | 'error' | 'info';

interface Notice {
  id: number;
  kind: NoticeKind;
  title: string;
  message: string;
  detail?: string;
}

let noticeId = 0;

export function useNotifications() {
  const [notices, setNotices] = createSignal<Notice[]>([]);

  const dismiss = (id: number) => setNotices((current) => current.filter((n) => n.id !== id));

  const notify = (kind: NoticeKind, title: string, message: string, detail?: string) => {
    const id = ++noticeId;
    setNotices((current) => [...current, { id, kind, title, message, detail }]);
    if (kind !== 'error') {
      window.setTimeout(() => dismiss(id), 6000);
    }
  };

  return { notices, notify, dismiss };
}

export function NoticeStack(props: { notices: Notice[]; onDismiss: (id: number) => void }) {
  return (
    <div class="notice-stack" role="region" aria-label="Notifications">
      <For each={props.notices}>
        {(notice) => (
          <div class={`notice notice-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
            <span class="notice-icon" aria-hidden="true">
              {notice.kind === 'success' ? '✓' : notice.kind === 'error' ? '✕' : 'ℹ'}
            </span>
            <div class="notice-copy">
              <strong>{notice.title}</strong>
              <p>{notice.message}</p>
              <Show when={notice.detail}>
                <details>
                  <summary>Details</summary>
                  <pre>{notice.detail}</pre>
                </details>
              </Show>
            </div>
            <button class="icon-button" aria-label="Dismiss notification" onClick={() => props.onDismiss(notice.id)}>
              ✕
            </button>
          </div>
        )}
      </For>
    </div>
  );
}
