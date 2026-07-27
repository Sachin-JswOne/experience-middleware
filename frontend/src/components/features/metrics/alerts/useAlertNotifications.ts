import { useEffect, useRef } from 'react';
import { appendAlertHistory } from './storage';
import type { AlertThresholds } from './types';

/**
 * Fires a browser notification (and records history) when a breach appears
 * that wasn't present on the previous snapshot — edge-triggered, not on every
 * poll.
 */
export const useAlertNotifications = (breaches: string[], thresholds: AlertThresholds) => {
  const previous = useRef<string>('');
  const notify = thresholds.notify;

  useEffect(() => {
    const signature = breaches.join('|');
    const isNew = signature && signature !== previous.current;
    previous.current = signature;
    if (!isNew) return;
    appendAlertHistory(breaches);
    if (!notify) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    new Notification('Observability alert', { body: breaches.join('\n') });
  }, [breaches, notify]);
};
