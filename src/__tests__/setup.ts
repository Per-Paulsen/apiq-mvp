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
