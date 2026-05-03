import '@testing-library/jest-dom/vitest';

// Radix UI primitives (used by shadcn/ui Checkbox, etc.) depend on ResizeObserver,
// which is not available in jsdom. Provide a minimal stub so components mount
// without throwing "ResizeObserver is not defined".
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver;
}
