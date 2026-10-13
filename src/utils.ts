import { createHash } from "node:crypto";
import {
  readFile as readFileAtomic,
  writeFile as writeFileAtomic,
} from "atomically";
import { isPlainObject, isString, trim } from "lodash-es";
import { CREDENTIALS_PATH } from "./constants.js";
import { CliError } from "./errors.js";

export type RecordValue = Record<string, unknown>;

export const sha256 = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");

export async function readJson(
  file: string,
  required = false,
): Promise<RecordValue> {
  try {
    const value: unknown = JSON.parse(await readFileAtomic(file, "utf8"));
    if (value == null) {
      return {};
    }
    if (!isPlainObject(value)) {
      throw new Error("Root value must be an object");
    }
    return value as RecordValue;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      if (required) {
        throw new CliError(`Required JSON file does not exist: ${file}`, 2);
      }
      return {};
    }
    throw new CliError(`Invalid JSON file: ${file}`, 2);
  }
}

export async function readCredentials(): Promise<{
  appId: string;
  appSecret: string;
}> {
  const value = await readJson(CREDENTIALS_PATH);
  return {
    appId: trim(isString(value.appId) ? value.appId : ""),
    appSecret: trim(isString(value.appSecret) ? value.appSecret : ""),
  };
}

export async function writeJsonAtomic(
  file: string,
  value: RecordValue,
): Promise<void> {
  await writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
}
