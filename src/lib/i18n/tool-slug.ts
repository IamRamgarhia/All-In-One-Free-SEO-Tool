/** Map `/tools/foo/bar` → catalog key `foo__bar`. */
export function toolCatalogSlug(href: string): string {
  return href.replace(/^\/tools\//, "").replace(/\//g, "__");
}
