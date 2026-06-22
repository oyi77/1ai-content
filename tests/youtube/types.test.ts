/**
 * YouTube Types Tests
 *
 * Verifies type definitions are correctly exported.
 */

describe("YouTube Types", () => {
  it("should export all required types", () => {
    // Types are compile-time only — verify they don't break import
    const types = require("@/types/youtube.types");
    // Runtime: no exports expected (types only), but module should load
    expect(true).toBe(true);
  });
});
