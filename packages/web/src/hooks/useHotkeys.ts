import { useEffect } from 'react';

/**
 * A simple hook that registers keyboard shortcuts.
 *
 * Takes a key map (Record<string, () => void>) where keys are
 * `KeyboardEvent.key` values (case-sensitive) and values are handler
 * callbacks.  Listeners are attached on mount and removed on unmount.
 *
 * Events originating from input/textarea/select elements are ignored
 * unless the key is Escape so that typing in form fields doesn't
 * accidentally trigger shortcuts.
 */
export function useHotkeys(keyMap: Record<string, () => void>) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore keyboard shortcuts when typing in form fields,
      // except for Escape which should always work.
      const tag = (e.target as HTMLElement)?.tagName;
      if (
        e.key !== 'Escape' &&
        (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')
      ) {
        return;
      }

      const fn = keyMap[e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [keyMap]);
}
