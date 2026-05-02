import "@testing-library/jest-dom/vitest";

// jsdom (v29) does not implement ResizeObserver. Radix UI primitives (used
// in shadcn Tooltip / Dialog / Popover etc.) call `new ResizeObserver(...)`
// at mount time. Provide a minimal no-op stub so tests rendering those
// components don't throw "ResizeObserver is not defined".
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = ResizeObserverStub;
}

// jsdom does not implement matchMedia. shadcn's `useIsMobile` (in the
// Sidebar) calls `window.matchMedia` on mount; without a polyfill the
// effect throws and any test rendering the (app)/layout fails.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
