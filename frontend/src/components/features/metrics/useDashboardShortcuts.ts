import { useEffect } from 'react';

interface Options {
  onRefresh: () => void;
  onToggleUtc: () => void;
  onSelectTab: (index: number) => void;
}

const isTypingTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  return Boolean(
    el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable),
  );
};

/** Keyboard shortcuts: r refresh, 1–4 tabs, u UTC. Skipped while typing. */
export const useDashboardShortcuts = ({ onRefresh, onToggleUtc, onSelectTab }: Options) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      if (e.key === 'r') {
        onRefresh();
      } else if (e.key === 'u') {
        onToggleUtc();
      } else if (['1', '2', '3', '4'].includes(e.key)) {
        onSelectTab(Number(e.key) - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onRefresh, onToggleUtc, onSelectTab]);
};

export default useDashboardShortcuts;
