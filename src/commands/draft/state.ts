import { access } from "node:fs/promises";
import { isPlainObject, isString, trim } from "lodash-es";
import { SERVICE_SCHEMA_URL } from "../../constants.js";
import { CliError } from "../../errors.js";
import { type RecordValue, readJson, sha256 } from "../../utils.js";

export interface ServiceState extends RecordValue {
  $schema: string;
  account_hash?: string;
  cover?: RecordValue;
  images: RecordValue;
  draft_media_id?: string;
  draft_status?: "submitting" | "saved" | "failed" | "unknown";
}

export function imageRecord(
  service: ServiceState,
  key: string,
): RecordValue | undefined {
  const images = service.images;
  if (!isPlainObject(images)) {
    return undefined;
  }
  const value = (images as RecordValue)[key];
  return isPlainObject(value) ? (value as RecordValue) : undefined;
}

export async function readService(file: string): Promise<ServiceState> {
  try {
    await access(file);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { $schema: SERVICE_SCHEMA_URL, images: {} };
    }
    throw error;
  }
  const service = await readJson(file, true);
  if (
    trim(isString(service.$schema) ? service.$schema : "") !==
    SERVICE_SCHEMA_URL
  ) {
    throw new CliError("Invalid or incompatible service.json state", 2);
  }
  const allowed = new Set([
    "$schema",
    "account_hash",
    "cover",
    "images",
    "draft_media_id",
    "draft_status",
  ]);
  for (const key of Object.keys(service)) {
    if (!allowed.has(key)) {
      throw new CliError(`Unsupported service.json field: ${key}`, 2);
    }
  }
  if (!isPlainObject(service.images)) {
    throw new CliError("Invalid or incompatible service.json state", 2);
  }
  if (
    service.account_hash !== undefined &&
    (typeof service.account_hash !== "string" ||
      !/^[a-f0-9]{64}$/.test(service.account_hash))
  ) {
    throw new CliError("Invalid or incompatible service.json state", 2);
  }
  const images = service.images as RecordValue;
  if (service.cover !== undefined && !isPlainObject(service.cover)) {
    throw new CliError("Invalid or incompatible service.json state", 2);
  }
  if (
    service.draft_status !== undefined &&
    !["submitting", "saved", "failed", "unknown"].includes(
      trim(isString(service.draft_status) ? service.draft_status : ""),
    )
  ) {
    throw new CliError("Invalid or incompatible service.json state", 2);
  }
  for (const [key, rawValue] of Object.entries(images)) {
    const value = rawValue as RecordValue;
    if (!/^sha256:[a-f0-9]{64}$/.test(key) || !isPlainObject(value)) {
      throw new CliError("Invalid or incompatible service.json state", 2);
    }
    for (const field of Object.keys(value)) {
      if (!["sha256", "path", "status", "url"].includes(field)) {
        throw new CliError(
          `Unsupported service.json record field: ${field}`,
          2,
        );
      }
    }
    if (
      trim(isString(value.sha256) ? value.sha256 : "") !==
        key.slice("sha256:".length) ||
      !trim(isString(value.path) ? value.path : "")
    ) {
      throw new CliError("Invalid or incompatible service.json state", 2);
    }
    if (
      !["uploading", "uploaded", "unknown"].includes(
        trim(isString(value.status) ? value.status : ""),
      )
    ) {
      throw new CliError("Invalid or incompatible service.json state", 2);
    }
    if (value.status === "uploaded") {
      try {
        if (
          new URL(trim(isString(value.url) ? value.url : "")).hostname !==
          "mmbiz.qpic.cn"
        ) {
          throw new Error("host");
        }
      } catch {
        throw new CliError("Invalid or incompatible service.json state", 2);
      }
    }
  }
  if (isPlainObject(service.cover)) {
    const cover = service.cover as RecordValue;
    for (const field of Object.keys(cover)) {
      if (!["sha256", "path", "status", "media_id"].includes(field)) {
        throw new CliError(
          `Unsupported service.json record field: ${field}`,
          2,
        );
      }
    }
    if (
      !/^[a-f0-9]{64}$/.test(
        trim(isString(cover.sha256) ? cover.sha256 : ""),
      ) ||
      !trim(isString(cover.path) ? cover.path : "")
    ) {
      throw new CliError("Invalid or incompatible service.json state", 2);
    }
    if (
      !["uploading", "uploaded", "unknown"].includes(
        trim(isString(cover.status) ? cover.status : ""),
      )
    ) {
      throw new CliError("Invalid or incompatible service.json state", 2);
    }
    if (
      cover.status === "uploaded" &&
      !trim(isString(cover.media_id) ? cover.media_id : "")
    ) {
      throw new CliError("Invalid or incompatible service.json state", 2);
    }
  }
  if (
    service.draft_media_id !== undefined &&
    !trim(isString(service.draft_media_id) ? service.draft_media_id : "")
  ) {
    throw new CliError("Invalid or incompatible service.json state", 2);
  }
  return service as ServiceState;
}

export function bindServiceAccount(service: ServiceState, appId: string): void {
  const accountHash = sha256(appId);
  if (service.account_hash === accountHash) {
    return;
  }
  if (
    service.account_hash !== undefined ||
    service.cover !== undefined ||
    Object.keys(service.images as RecordValue).length > 0 ||
    service.draft_media_id !== undefined ||
    service.draft_status !== undefined
  ) {
    throw new CliError(
      "service.json belongs to another or an unverified account; verify and migrate it before syncing",
      2,
    );
  }
  service.account_hash = accountHash;
}
