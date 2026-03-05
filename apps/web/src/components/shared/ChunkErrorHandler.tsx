'use client';

import { useEffect } from 'react';

const RELOAD_KEY = 'chunk-error-auto-reload';

function shouldReload(reason: unknown) {
  if (!reason) return false;

  const message =
    typeof reason === 'string'
      ? reason
      : reason instanceof Error
        ? reason.message
        : JSON.stringify(reason);

  return /ChunkLoadError|Loading chunk\s+\d+\s+failed|Failed to fetch dynamically imported module/i.test(message);
}

function isChunkAssetError(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLScriptElement || target instanceof HTMLLinkElement)) {
    return false;
  }

  const assetUrl = target instanceof HTMLScriptElement ? target.src : target.href;
  return assetUrl.includes('/_next/static/chunks/');
}

export function ChunkErrorHandler() {
  useEffect(() => {
    const recoverOnce = () => {
      const hasRetried = sessionStorage.getItem(RELOAD_KEY) === '1';
      if (hasRetried) {
        sessionStorage.removeItem(RELOAD_KEY);
        return;
      }

      sessionStorage.setItem(RELOAD_KEY, '1');
      window.location.reload();
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (shouldReload(event.reason)) {
        recoverOnce();
      }
    };

    const onAssetError = (event: Event) => {
      if (isChunkAssetError(event)) {
        recoverOnce();
      }
    };

    const onLoad = () => {
      sessionStorage.removeItem(RELOAD_KEY);
    };

    window.addEventListener('unhandledrejection', onUnhandledRejection);
    window.addEventListener('error', onAssetError, true);
    window.addEventListener('load', onLoad);

    return () => {
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      window.removeEventListener('error', onAssetError, true);
      window.removeEventListener('load', onLoad);
    };
  }, []);

  return null;
}
