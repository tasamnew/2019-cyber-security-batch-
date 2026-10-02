'use client';

import { useCallback, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

/**
 * Share control.
 *
 * Uses the Web Share API where it exists, which on both Android and iOS opens
 * the real system sheet: WhatsApp, Telegram, Mail, and so on. That is the only
 * approach that reaches those apps, since a dropdown of hand-built links is
 * both uglier and one that silently omits whatever the user actually has.
 *
 * The clipboard is the fallback, and it is not a lesser path: `navigator.share`
 * is absent on desktop Firefox and on any browser without HTTPS, and a copy
 * button that is always reachable covers those without a layout that flickers
 * between two different buttons.
 */

export function ShareButton({
  title,
  text,
  url,
  className,
  label = 'Share',
  compact = false,
}: {
  title: string;
  text?: string;
  /** Defaults to the current location, captured at click time. */
  url?: string;
  className?: string;
  label?: string;
  compact?: boolean;
}) {
  const { push } = useToast();
  const [busy, setBusy] = useState(false);

  const share = useCallback(async () => {
    const href = url ?? window.location.href;

    if (navigator.share) {
      setBusy(true);
      try {
        await navigator.share({ title, text, url: href });
        // Reaching here means the sheet was dismissed or completed; either way
        // there is nothing left to do.
        return;
      } catch (err) {
        // A user closing the sheet is a normal outcome, not a failure worth a
        // toast. `AbortError` is what every engine throws for that.
        if (err instanceof DOMException && err.name === 'AbortError') return;
      } finally {
        setBusy(false);
      }
    }

    try {
      await navigator.clipboard.writeText(href);
      push('Link copied to clipboard.', 'success');
    } catch {
      push('Could not share this link.', 'error');
    }
  }, [url, title, text, push]);

  return (
    <button
      type="button"
      onClick={share}
      disabled={busy}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-secondary transition hover:border-accent-green/50 hover:text-text-primary disabled:opacity-40',
        className,
      )}
      aria-label={`Share ${title}`}
    >
      <span aria-hidden>↗</span>
      {!compact && label}
    </button>
  );
}
