'use client';

import { useEffect, useState } from 'react';

/**
 * Registers the service worker and exposes an install prompt.
 *
 * Installability has two separate requirements, and iOS satisfies only half of
 * them from JavaScript:
 *
 *  - Android/Chrome: needs a manifest *and* a registered service worker with a
 *    fetch handler. The browser then fires `beforeinstallprompt`, which can be
 *    captured and replayed from a button. Nothing is shown if the user has
 *    already installed the app, because the event simply does not fire.
 *
 *  - iOS/Safari: has no `beforeinstallprompt` at all, and deliberately does not
 *    let a page trigger installation. The only path is Share > Add to Home
 *    Screen. So on iOS the button is replaced with those instructions, which is
 *    the difference between a working prompt and a dead button.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'cs-hub:install-dismissed';

function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  // iPadOS 13+ reports as Mac with a touch screen, so the UA test alone misses it.
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());

    const onPrompt = (event: Event) => {
      // Chrome would otherwise show its own mini-infobar, which cannot be styled
      // and disappears on its own schedule.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      // Registration failure is non-fatal: the site works fine without it, only
      // the install prompt and the offline page go away.
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err: unknown) => {
        console.error('[pwa] service worker registration failed', err);
      });
    }
  }, []);

  // Nothing to offer when already installed, or once dismissed this session.
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    setDismissed(sessionStorage.getItem(DISMISSED_KEY) === '1');
  }, []);

  if (installed || dismissed || (!deferred && !detectIOS())) return null;

  async function install() {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'accepted') return;
      setDeferred(null);
    } else {
      setShowIOSHelp(true);
      return;
    }
    sessionStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2">
      {showIOSHelp ? (
        <div className="card flex items-start gap-3 p-4 shadow-lg">
          <p className="flex-1 text-xs leading-relaxed text-text-secondary">
            In Safari, tap <strong className="text-text-primary">Share</strong> and then{' '}
            <strong className="text-text-primary">Add to Home Screen</strong>.
          </p>
          <button
            type="button"
            onClick={() => {
              setShowIOSHelp(false);
              sessionStorage.setItem(DISMISSED_KEY, '1');
              setDismissed(true);
            }}
            className="text-xs text-text-tertiary hover:text-text-primary"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="card flex items-center gap-3 p-4 shadow-lg">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text-primary">Install the app</p>
            <p className="text-xs text-text-tertiary">Runs fullscreen, opens like a native app.</p>
          </div>
          <button type="button" onClick={install} className="btn-primary shrink-0 text-sm">
            Install
          </button>
          <button
            type="button"
            onClick={() => {
              sessionStorage.setItem(DISMISSED_KEY, '1');
              setDismissed(true);
            }}
            className="shrink-0 text-xs text-text-tertiary hover:text-text-primary"
            aria-label="Not now"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
