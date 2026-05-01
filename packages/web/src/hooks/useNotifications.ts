import { useEffect, useRef, useState, useCallback } from 'react';
import { isDemoMode } from '../config/flags';

/**
 * Browser Notification hook for CRITICAL cases (FR-057.A4).
 *
 * On mount, requests Notification.permission.
 * Exposes `notify(title, body)` to fire a browser notification.
 * In demo mode, fires a mock notification every 30 s for a CRITICAL case.
 */
export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  );
  const demoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().then((perm) => setPermission(perm));
    }
  }, []);

  const notify = useCallback(
    (title: string, body?: string) => {
      if (typeof Notification === 'undefined') return;
      if (permission !== 'granted') return;
      new Notification(title, { body, icon: '/favicon.ico' });
    },
    [permission],
  );

  // Demo mode: simulate a CRITICAL case notification
  useEffect(() => {
    if (!isDemoMode()) return;
    if (permission !== 'granted') return;

    demoTimerRef.current = setInterval(() => {
      notify(
        'CRITICAL Case Alert',
        'CASE-9999: Urgent valuation shortfall detected — immediate review required.',
      );
    }, 30_000);

    return () => {
      if (demoTimerRef.current) clearInterval(demoTimerRef.current);
    };
  }, [permission, notify]);

  return { permission, notify };
}
