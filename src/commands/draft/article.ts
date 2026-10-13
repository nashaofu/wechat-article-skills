import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { isString, trim } from "lodash-es";
import { type DefaultTreeAdapterMap, parseFragment } from "parse5";
import {
  ARTICLE_SCHEMA_URL,
  BODY_IMAGE_EXTENSIONS,
  COVER_IMAGE_EXTENSIONS,
} from "../../constants.js";
import { CliError } from "../../errors.js";
import { readJson, sha256 } from "../../utils.js";

export type HtmlNode = DefaultTreeAdapterMap["node"];

function pathKey(path: string): string {
  return process.platform === "win32" ? path.toLowerCase() : path;
}
export interface ArticleInput {
  dir: string;
  coverPath: string;
  title: string;
  author: string;
  digest: string;
  source: string;
  html: string;
  htmlFragment: DefaultTreeAdapterMap["documentFragment"];
  coverFile: string;
  coverHash: string;
  bodyImages: Map<
    string,
    { path: string; relativePath: string; hash: string; srcs: Set<string> }
  >;
  blockers: string[];
}

async function containedPath(
  base: string,
  value: string,
  label: string,
): Promise<string> {
  if (!value || isAbsolute(value) || value.split(/[\\/]/).includes("..")) {
    throw new CliError(
      `${label} must be a relative path inside the article directory`,
      2,
    );
  }
  const target = resolve(base, value);
  const rel = relative(base, target);
  if (
    rel === ".." ||
    rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(rel)
  )
    throw new CliError(
      `${label} must be a relative path inside the article directory`,
      2,
    );
  const targetStat = await stat(target).catch(() => undefined);
  if (!targetStat?.isFile()) {
    throw new CliError(`${label} file does not exist: ${value}`, 2);
  }
  const realBase = await realpath(base);
  const realTarget = await realpath(target);
  const realRel = relative(realBase, realTarget);
  if (
    realRel === ".." ||
    realRel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(realRel)
  )
    throw new CliError(
      `${label} must be a relative path inside the article directory`,
      2,
    );
  return target;
}

export async function articleDirectory(
  workspace: string,
  input: string,
): Promise<string> {
  const root = await realpath(resolve(workspace));
  const dir = resolve(root, input);
  const dirStat = await stat(dir).catch(() => undefined);
  if (!dirStat?.isDirectory()) {
    throw new CliError(`Article directory does not exist: ${input}`, 2);
  }
  const realDir = await realpath(dir);
  const rel = relative(root, realDir);
  if (
    rel === ".." ||
    rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(rel)
  )
    throw new CliError("Article directory must be inside the workspace", 2);
  return realDir;
}

async function inspectImage(file: string, cover: boolean): Promise<string[]> {
  const blockers: string[] = [];
  const ext = extname(file).toLowerCase();
  const allowedExtensions = cover
    ? COVER_IMAGE_EXTENSIONS
    : BODY_IMAGE_EXTENSIONS;
  if (!allowedExtensions.has(ext)) {
    return [`Unsupported or invalid image file: ${file}`];
  }
  if ((await stat(file)).size > (cover ? 10_000_000 : 1_000_000)) {
    blockers.push(
      `${cover ? "Cover" : "Body image"} exceeds the size limit: ${file}`,
    );
  }
  return blockers;
}

export async function readArticle(
  workspace: string,
  input: string,
): Promise<ArticleInput> {
  const dir = await articleDirectory(workspace, input);
  const article = await readJson(resolve(dir, "article.json"), true);
  const blockers: string[] = [];
  if (
    trim(isString(article.$schema) ? article.$schema : "") !==
    ARTICLE_SCHEMA_URL
  ) {
    blockers.push("Article metadata is missing or invalid");
  }
  const allowed = new Set([
    "$schema",
    "title",
    "author",
    "digest",
    "content_source_url",
    "markdown",
    "html",
    "cover",
    "images",
  ]);
  for (const key of Object.keys(article)) {
    if (!allowed.has(key)) {
      blockers.push(`Unsupported article.json field: ${key}`);
    }
  }
  for (const key of [
    "title",
    "author",
    "digest",
    "content_source_url",
    "markdown",
    "html",
    "cover",
  ]) {
    if (typeof article[key] !== "string") {
      blockers.push(`article.json field ${key} must be a string`);
    }
  }
  for (const key of ["title", "digest", "markdown", "html", "cover"]) {
    if (!trim(isString(article[key]) ? article[key] : "")) {
      blockers.push(`article.json is missing ${key}`);
    }
  }
  const title = trim(isString(article.title) ? article.title : "");
  const digest = trim(isString(article.digest) ? article.digest : "");
  const sourceValue = isString(article.content_source_url)
    ? article.content_source_url
    : "";
  const source = trim(sourceValue);
  const author = trim(isString(article.author) ? article.author : "");
  const coverPath = trim(isString(article.cover) ? article.cover : "");
  if (digest.length > 128) {
    blockers.push("digest must not exceed 128 characters");
  }
  if (sourceValue !== source) {
    blockers.push("content_source_url must not contain surrounding whitespace");
  }
  if (source) {
    try {
      const sourceUrl = new URL(source);
      if (sourceUrl.protocol !== "https:" || !sourceUrl.hostname) {
        blockers.push("content_source_url must be a valid HTTPS URL");
      }
    } catch {
      blockers.push("content_source_url must be a valid HTTPS URL");
    }
  }
  if (
    !Array.isArray(article.images) ||
    article.images.some((value) => typeof value !== "string")
  ) {
    blockers.push("article.json images must be an array of relative paths");
  }

  let markdownFile = "";
  let htmlFile = "";
  let coverFile = "";
  try {
    markdownFile = await containedPath(
      dir,
      trim(isString(article.markdown) ? article.markdown : ""),
      "markdown",
    );
  } catch (error) {
    blockers.push(
      error instanceof Error
        ? error.message
        : "Unable to read the referenced article file",
    );
  }
  try {
    htmlFile = await containedPath(
      dir,
      trim(isString(article.html) ? article.html : ""),
      "html",
    );
  } catch (error) {
    blockers.push(
      error instanceof Error
        ? error.message
        : "Unable to read the referenced article file",
    );
  }
  try {
    coverFile = await containedPath(dir, coverPath, "cover");
    blockers.push(...(await inspectImage(coverFile, true)));
  } catch (error) {
    blockers.push(
      error instanceof Error
        ? error.message
        : "Unable to read the referenced article file",
    );
  }

  const html = htmlFile ? await readFile(htmlFile, "utf8") : "";
  const htmlFragment = parseFragment(html);
  const markdown = markdownFile ? await readFile(markdownFile, "utf8") : "";
  if (!markdown.trim()) {
    blockers.push("Article metadata is missing or invalid");
  }
  if (!html.trim()) {
    blockers.push("Article metadata is missing or invalid");
  }
  if (/\{embed:[^}]+\}|\b(?:placeholder|TODO)\b/i.test(markdown + html)) {
    blockers.push("Article still contains placeholders");
  }
  if (/tempkey=/i.test(html)) {
    blockers.push("Article contains a temporary preview URL");
  }

  const imagePaths = new Map<
    string,
    { path: string; relativePath: string; hash: string }
  >();
  if (Array.isArray(article.images)) {
    for (const value of article.images) {
      if (typeof value !== "string") {
        continue;
      }
      try {
        const path = await containedPath(dir, value, "Body image");
        blockers.push(...(await inspectImage(path, false)));
        const hash = sha256(await readFile(path));
        imagePaths.set(pathKey(resolve(path)), {
          path,
          relativePath: value,
          hash,
        });
      } catch (error) {
        blockers.push(
          error instanceof Error
            ? error.message
            : `Invalid article image path: ${value}`,
        );
      }
    }
  }

  const bodyImages = new Map<
    string,
    { path: string; relativePath: string; hash: string; srcs: Set<string> }
  >();
  const imageSources: string[] = [];
  const visitHtmlNode = (node: HtmlNode) => {
    if (node.nodeName === "script") {
      blockers.push("Article contains a script tag");
    }
    if (["iframe", "object", "embed", "form"].includes(node.nodeName)) {
      blockers.push("Article metadata is missing or invalid");
    }
    if (
      "attrs" in node &&
      node.attrs.some(
        (attribute) =>
          /^on/i.test(attribute.name) ||
          /javascript:|file:\/\//i.test(attribute.value),
      )
    ) {
      blockers.push("Article metadata is missing or invalid");
    }
    if (node.nodeName === "img") {
      const src =
        "attrs" in node
          ? node.attrs.find((attribute) => attribute.name === "src")?.value
          : undefined;
      if (src === undefined) {
        blockers.push("Article metadata is missing or invalid");
      } else {
        imageSources.push(src);
      }
    }
    if ("childNodes" in node) {
      for (const child of node.childNodes) {
        visitHtmlNode(child);
      }
    }
  };
  visitHtmlNode(htmlFragment);
  for (const src of imageSources) {
    if (/^https:\/\//i.test(src)) {
      try {
        if (new URL(src).hostname !== "mmbiz.qpic.cn") {
          blockers.push(
            `Body image is not listed in article.json images: ${src}`,
          );
        }
      } catch {
        blockers.push(`Invalid body image URL: ${src}`);
      }
      continue;
    }
    if (
      !src ||
      /^[a-z]+:/i.test(src) ||
      src.startsWith("//") ||
      src.startsWith("/") ||
      src.includes("..") ||
      /[?#]/.test(src)
    ) {
      blockers.push(`Unsupported body image path: ${src}`);
      continue;
    }
    if (!htmlFile) {
      continue;
    }
    let imagePath: string;
    try {
      imagePath = resolve(dirname(htmlFile), decodeURIComponent(src));
    } catch {
      blockers.push(`Invalid body image path: ${src}`);
      continue;
    }
    const listed = imagePaths.get(pathKey(imagePath));
    if (!listed) {
      blockers.push(`Body image is not listed in article.json images: ${src}`);
      continue;
    }
    const key = `sha256:${listed.hash}`;
    const entry = bodyImages.get(key) ?? { ...listed, srcs: new Set<string>() };
    entry.srcs.add(src);
    bodyImages.set(key, entry);
  }

  return {
    dir,
    coverPath,
    title,
    author,
    digest,
    source,
    html,
    htmlFragment,
    coverFile,
    coverHash: coverFile ? sha256(await readFile(coverFile)) : "",
    bodyImages,
    blockers,
  };
}
