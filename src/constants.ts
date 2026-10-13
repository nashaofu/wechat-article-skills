import { homedir } from "node:os";
import { resolve } from "node:path";

export const CREDENTIALS_PATH = resolve(
  homedir(),
  ".wechat-article",
  "config.json",
);

export const ACCESS_TOKEN_CACHE_PATH = resolve(
  homedir(),
  ".wechat-article",
  "access-token.json",
);

export const ARTICLE_SCHEMA_URL =
  "https://raw.githubusercontent.com/nashaofu/wechat-article-skills/master/schemas/article.schema.json";
export const SERVICE_SCHEMA_URL =
  "https://raw.githubusercontent.com/nashaofu/wechat-article-skills/master/schemas/service.schema.json";

export const COVER_IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".png",
  ".gif",
  ".jpg",
  ".jpeg",
]);

export const BODY_IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".png",
  ".jpg",
  ".jpeg",
]);
