import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./url-guard", () => ({
  guardedFetch: (url: string, init?: RequestInit) => fetch(url, init),
}));

import {
  formatWooPrice,
  listWooProducts,
  shopBaseUrl,
  trimToLength,
  WooShopError,
} from "./woo-products";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(res: Response | Error) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => {
    if (res instanceof Error) throw res;
    return res;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("woo-products", () => {
  it("normalises the shop address", () => {
    expect(shopBaseUrl("shop.example.com/")).toBe("https://shop.example.com");
    expect(shopBaseUrl("")).toBeNull();
  });

  it("reads in-stock products from the public Store API", async () => {
    const fn = stubFetch(
      new Response(
        JSON.stringify([
          {
            id: 7,
            name: "Moulin <b>manuel</b>",
            permalink: "https://shop.example.com/p/moulin",
            short_description: "<p>Réglage fin&nbsp;: 40 crans</p>",
            prices: { price: "14900", currency_code: "EUR", currency_minor_unit: 2 },
            images: [{ src: "https://shop.example.com/m.jpg" }],
          },
          { id: 8, name: "Sans lien" },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const list = await listWooProducts("https://shop.example.com", { locale: "fr" });
    expect(String(fn.mock.calls[0][0])).toContain("/wp-json/wc/store/v1/products?");
    expect(String(fn.mock.calls[0][0])).toContain("stock_status=instock");
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Moulin manuel");
    expect(list[0].shortDescription).toBe("Réglage fin : 40 crans");
    expect(list[0].imageUrl).toBe("https://shop.example.com/m.jpg");
    expect(list[0].price?.replace(/\s/g, " ")).toBe("149,00 €");
  });

  it("says when the site is not a WooCommerce shop", async () => {
    stubFetch(new Response("<html>404</html>", { status: 404 }));
    await expect(listWooProducts("https://example.com")).rejects.toMatchObject({
      code: "not_woo",
    });
    stubFetch(new Response("<html>ok</html>", { status: 200 }));
    await expect(listWooProducts("https://example.com")).rejects.toBeInstanceOf(WooShopError);
  });

  it("says when the site does not answer or has no address", async () => {
    stubFetch(new Error("ECONNREFUSED"));
    await expect(listWooProducts("https://example.com")).rejects.toMatchObject({
      code: "unreachable",
    });
    await expect(listWooProducts(null)).rejects.toMatchObject({ code: "no_url" });
  });

  it("hides missing prices instead of inventing one", () => {
    expect(formatWooPrice(undefined)).toBeNull();
    expect(formatWooPrice({ price: "0" })).toBeNull();
  });

  it("trims a post without cutting a word", () => {
    const text = "Première phrase assez longue pour compter. Deuxième phrase qui dépasse la limite fixée.";
    expect(trimToLength(text, 200)).toBe(text);
    expect(trimToLength(text, 50)).toBe("Première phrase assez longue pour compter.");
    const cut = trimToLength("un deux trois quatre cinq six", 12);
    expect(cut.length).toBeLessThanOrEqual(12);
    expect(cut).toBe("un deux…");
  });
});
