import { type DefaultTreeAdapterMap, serialize } from "parse5";

type HtmlNode = DefaultTreeAdapterMap["node"];

export function replaceImageSources(
  fragment: DefaultTreeAdapterMap["documentFragment"],
  urls: ReadonlyMap<string, string>,
): string {
  const visit = (node: HtmlNode): void => {
    if (node.nodeName === "img" && "attrs" in node) {
      const src = node.attrs.find((attribute) => attribute.name === "src");
      if (src) {
        src.value = urls.get(src.value) ?? src.value;
      }
    }
    if ("childNodes" in node) {
      for (const child of node.childNodes) {
        visit(child);
      }
    }
  };
  visit(fragment);
  return serialize(fragment);
}
