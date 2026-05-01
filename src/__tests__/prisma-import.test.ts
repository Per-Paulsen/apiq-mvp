import { describe, it, expect } from "vitest";

describe("prisma singleton import", () => {
  it("imports without throwing", async () => {
    // Dynamic import to avoid eager DB connection if module-scope code does that
    const mod = await import("@/lib/prisma");
    expect(mod.prisma).toBeDefined();
  });
});
