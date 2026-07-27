import { useEffect, useState } from 'react';

/**
 * Wall-clock time as state, ticking every `intervalMs`.
 *
 * Reading `Date.now()` during render makes the render impure — the same props
 * produce different output — which React's compiler and lint rules reject.
 * Anything whose display depends on "is it past X yet" (snooze expiry, relative
 * timestamps) should derive from this instead.
 */
export const useNow = (intervalMs = 30_000): number => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
};
