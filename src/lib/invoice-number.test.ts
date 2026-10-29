import { describe, expect, it } from "vitest";
import { nextSequenceNumber } from "./invoice-utils";

describe("nextSequenceNumber", () => {
  it("starts the year at 0001", () => {
    expect(nextSequenceNumber([], 2026)).toBe("INV-2026-0001");
  });

  it("does not reuse a number after a delete", () => {
    // Five issued, #3 deleted: "count + 1" gave INV-2026-0005 again.
    const left = ["INV-2026-0001", "INV-2026-0002", "INV-2026-0004", "INV-2026-0005"];
    expect(nextSequenceNumber(left, 2026)).toBe("INV-2026-0006");
  });

  it("remembers a deleted highest number", () => {
    expect(nextSequenceNumber(["INV-2026-0001"], 2026, 7)).toBe("INV-2026-0008");
  });

  it("restarts each year", () => {
    expect(nextSequenceNumber(["INV-2026-0042"], 2027)).toBe("INV-2027-0001");
  });

  it("ignores hand-typed numbers in other formats", () => {
    expect(nextSequenceNumber(["DICE-17", "INV-2026-0002"], 2026)).toBe("INV-2026-0003");
  });
});
