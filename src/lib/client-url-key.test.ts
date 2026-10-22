import { describe, expect, it } from "vitest";
import { clientUrlKey } from "./client-url-key";

describe("clientUrlKey", () => {
  it("normalizes host and trailing slash", () => {
    expect(clientUrlKey("https://nd-prestige.tech/")).toBe("nd-prestige.tech");
    expect(clientUrlKey("https://www.nd-prestige.tech")).toBe("nd-prestige.tech");
    expect(clientUrlKey("nd-prestige.tech/")).toBe("nd-prestige.tech");
  });
});
