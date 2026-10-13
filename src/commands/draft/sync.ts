import type { FileHandle } from "node:fs/promises";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import axios from "axios";
import { isPlainObject, isString, trim } from "lodash-es";
import { SERVICE_SCHEMA_URL } from "../../constants.js";
import { CliError } from "../../errors.js";
import {
  type RecordValue,
  readCredentials,
  writeJsonAtomic,
} from "../../utils.js";
import {
  type ApiResponse,
  apiResponseError,
  fetchAccessTokenFor,
  isApiErrorResponse,
  wechatApi,
} from "./api.js";
import { type ArticleInput, articleDirectory, readArticle } from "./article.js";
import { replaceImageSources } from "./content.js";
import {
  bindServiceAccount,
  imageRecord,
  readService,
  type ServiceState,
} from "./state.js";

interface BodyImageUploadSuccess {
  url: string;
}

interface CoverImageUploadSuccess {
  media_id: string;
}

interface DraftUpdateSuccess {
  errcode: 0;
  errmsg: string;
}

interface DraftAddSuccess {
  media_id: string;
}

function remoteWriteError(error: unknown): CliError {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429
  ) {
    return new CliError("WeChat API rejected the request", 3);
  }
  return new CliError(
    "Remote operation result is unknown; verify before retrying",
    4,
  );
}

async function saveFailureState(
  serviceFile: string,
  service: ServiceState,
  failure: CliError,
): Promise<never> {
  try {
    await writeJsonAtomic(serviceFile, service);
  } catch {
    throw new CliError(
      "Service state could not be saved; verify the remote result before retrying",
      4,
      { remote_error: failure.message },
    );
  }
  throw failure;
}

async function saveConfirmedState(
  serviceFile: string,
  service: ServiceState,
): Promise<void> {
  try {
    await writeJsonAtomic(serviceFile, service);
  } catch {
    throw new CliError(
      "Remote operation result is unknown; verify before retrying",
      4,
    );
  }
}

function imageContentType(file: string): string {
  const ext = extname(file).toLowerCase();
  if (ext === ".png") {
    return "image/png";
  }
  if (ext === ".gif") {
    return "image/gif";
  }
  return "image/jpeg";
}

async function createImageForm(
  file: string,
  maxBytes: number,
): Promise<FormData> {
  const form = new FormData();
  const bytes = await readFile(file);
  if (bytes.byteLength > maxBytes) {
    throw new CliError(
      `Image exceeds the upload size limit: ${basename(file)}`,
      2,
    );
  }
  form.append(
    "media",
    new Blob([bytes], { type: imageContentType(file) }),
    basename(file),
  );
  return form;
}

async function uploadImage(token: string, file: string): Promise<string> {
  const form = await createImageForm(file, 1_000_000);
  let reply: ApiResponse<BodyImageUploadSuccess>;
  try {
    ({ data: reply } = await wechatApi.post<
      ApiResponse<BodyImageUploadSuccess>
    >("/cgi-bin/media/uploadimg", form, {
      params: { access_token: token },
    }));
  } catch (error) {
    throw remoteWriteError(error);
  }
  if (isApiErrorResponse(reply)) {
    throw apiResponseError(reply, "image_upload");
  }
  const value =
    isPlainObject(reply) && typeof reply.url === "string"
      ? reply.url.trim()
      : "";
  if (!value) {
    throw new CliError(
      "Remote operation result is unknown; verify before retrying",
      4,
    );
  }
  return value;
}

async function uploadCoverImage(token: string, file: string): Promise<string> {
  const form = await createImageForm(file, 10_000_000);
  let reply: ApiResponse<CoverImageUploadSuccess>;
  try {
    ({ data: reply } = await wechatApi.post<
      ApiResponse<CoverImageUploadSuccess>
    >("/cgi-bin/material/add_material", form, {
      params: { access_token: token, type: "image" },
    }));
  } catch (error) {
    throw remoteWriteError(error);
  }
  if (isApiErrorResponse(reply)) {
    throw apiResponseError(reply, "cover_upload");
  }
  const value =
    isPlainObject(reply) && typeof reply.media_id === "string"
      ? reply.media_id.trim()
      : "";
  if (!value) {
    throw new CliError(
      "Remote operation result is unknown; verify before retrying",
      4,
    );
  }
  return value;
}

async function uploadCover(
  x: ArticleInput,
  serviceFile: string,
  service: ServiceState,
  token: string,
): Promise<string> {
  if (!x.coverFile) {
    throw new CliError("Cover image is missing", 2);
  }
  const saved = service.cover;
  const savedRecord = saved as RecordValue;
  if (
    isPlainObject(saved) &&
    trim(isString(savedRecord.sha256) ? savedRecord.sha256 : "") === x.coverHash
  ) {
    const cover = saved as RecordValue;
    if (cover.status === "unknown" || cover.status === "uploading") {
      throw new CliError(
        "Remote operation result is unknown; verify before retrying",
        4,
      );
    }
    if (
      cover.status === "uploaded" &&
      trim(isString(cover.media_id) ? cover.media_id : "")
    ) {
      if (cover.path !== x.coverPath) {
        cover.path = x.coverPath;
        await writeJsonAtomic(serviceFile, service);
      }
      return trim(isString(cover.media_id) ? cover.media_id : "");
    }
  }
  service.cover = {
    sha256: x.coverHash,
    path: x.coverPath,
    status: "uploading",
  };
  await writeJsonAtomic(serviceFile, service);
  try {
    const mediaId = await uploadCoverImage(token, x.coverFile);
    service.cover = {
      sha256: x.coverHash,
      path: x.coverPath,
      status: "uploaded",
      media_id: mediaId,
    };
    await saveConfirmedState(serviceFile, service);
    return mediaId;
  } catch (error) {
    if (error instanceof CliError && error.code === 4) {
      service.cover = {
        sha256: x.coverHash,
        path: x.coverPath,
        status: "unknown",
      };
      return await saveFailureState(serviceFile, service, error);
    } else {
      delete service.cover;
      return await saveFailureState(
        serviceFile,
        service,
        error instanceof CliError ? error : remoteWriteError(error),
      );
    }
  }
}

async function uploadBodyImage(
  key: string,
  image: {
    path: string;
    relativePath: string;
    hash: string;
    srcs: Set<string>;
  },
  serviceFile: string,
  service: ServiceState,
  token: string,
): Promise<string> {
  const saved = imageRecord(service, key);
  if (
    saved &&
    trim(isString(saved.sha256) ? saved.sha256 : "") === image.hash
  ) {
    if (saved.status === "unknown" || saved.status === "uploading") {
      throw new CliError(
        `Image upload result is unknown: ${image.relativePath}`,
        4,
      );
    }
    if (
      saved.status === "uploaded" &&
      trim(isString(saved.url) ? saved.url : "")
    ) {
      if (saved.path !== image.relativePath) {
        saved.path = image.relativePath;
        await writeJsonAtomic(serviceFile, service);
      }
      return trim(isString(saved.url) ? saved.url : "");
    }
  }
  const images = isPlainObject(service.images)
    ? (service.images as RecordValue)
    : {};
  images[key] = {
    sha256: image.hash,
    path: image.relativePath,
    status: "uploading",
  };
  service.images = images;
  await writeJsonAtomic(serviceFile, service);
  try {
    const url = await uploadImage(token, image.path);
    images[key] = {
      sha256: image.hash,
      path: image.relativePath,
      status: "uploaded",
      url,
    };
    await saveConfirmedState(serviceFile, service);
    return url;
  } catch (error) {
    if (error instanceof CliError && error.code === 4) {
      images[key] = {
        sha256: image.hash,
        path: image.relativePath,
        status: "unknown",
      };
    } else {
      delete images[key];
    }
    service.images = images;
    return await saveFailureState(
      serviceFile,
      service,
      error instanceof CliError ? error : remoteWriteError(error),
    );
  }
}

async function syncDraftLocked(
  workspace: string,
  input: string,
  credentials: { appId: string; appSecret: string },
): Promise<RecordValue> {
  const x = await readArticle(workspace, input);
  if (x.blockers.length) {
    throw new CliError("Article files failed validation", 2, {
      blockers: x.blockers,
    });
  }
  const serviceFile = resolve(x.dir, "service.json");
  const service = await readService(serviceFile);
  if (!credentials.appId || !credentials.appSecret) {
    throw new CliError(
      "WeChat credentials are missing; run `wechat-article config init`",
      2,
    );
  }
  bindServiceAccount(service, credentials.appId);
  if (
    service.draft_status === "unknown" ||
    service.draft_status === "submitting"
  ) {
    throw new CliError(
      "Remote operation result is unknown; verify before retrying",
      4,
    );
  }
  if (isPlainObject(service.cover)) {
    const cover = service.cover as RecordValue;
    if (
      ["unknown", "uploading"].includes(
        trim(isString(cover.status) ? cover.status : ""),
      )
    ) {
      throw new CliError(
        "Remote operation result is unknown; verify before retrying",
        4,
      );
    }
  }
  if (
    Object.values(service.images as RecordValue).some((item) => {
      if (!isPlainObject(item)) {
        return false;
      }
      const image = item as RecordValue;
      return ["unknown", "uploading"].includes(
        trim(isString(image.status) ? image.status : ""),
      );
    })
  ) {
    throw new CliError(
      "Remote operation result is unknown; verify before retrying",
      4,
    );
  }

  const token = await fetchAccessTokenFor(credentials);

  await mkdir(dirname(serviceFile), { recursive: true });
  service.$schema = SERVICE_SCHEMA_URL;
  if (!isPlainObject(service.images)) {
    service.images = {};
  }
  await writeJsonAtomic(serviceFile, service);

  const coverId = await uploadCover(x, serviceFile, service, token);
  const bodyImageUrls = new Map<string, string>();
  let reusedImages = 0;
  for (const [key, image] of x.bodyImages) {
    if (imageRecord(service, key)?.status === "uploaded") {
      reusedImages++;
    }
    const url = await uploadBodyImage(key, image, serviceFile, service, token);
    for (const src of image.srcs) {
      bodyImageUrls.set(src, url);
    }
  }
  const content = replaceImageSources(x.htmlFragment, bodyImageUrls);
  const article = {
    title: x.title,
    author: x.author,
    digest: x.digest,
    content,
    content_source_url: x.source,
    thumb_media_id: coverId,
    show_cover_pic: 1,
    need_open_comment: 0,
    only_fans_can_comment: 0,
  };
  const existingId = trim(
    isString(service.draft_media_id) ? service.draft_media_id : "",
  );
  service.draft_status = "submitting";
  await writeJsonAtomic(serviceFile, service);
  try {
    let mediaId = existingId;
    if (existingId) {
      const { data } = await wechatApi
        .post<ApiResponse<DraftUpdateSuccess>>(
          "/cgi-bin/draft/update",
          { media_id: existingId, index: 0, articles: article },
          { params: { access_token: token } },
        )
        .catch((error: unknown) => {
          throw remoteWriteError(error);
        });
      if (!isPlainObject(data) || data.errcode !== 0) {
        throw apiResponseError(data, "draft_update");
      }
    } else {
      const { data } = await wechatApi
        .post<ApiResponse<DraftAddSuccess>>(
          "/cgi-bin/draft/add",
          { articles: [article] },
          { params: { access_token: token } },
        )
        .catch((error: unknown) => {
          throw remoteWriteError(error);
        });
      if (isApiErrorResponse(data)) {
        throw apiResponseError(data, "draft_add");
      }
      mediaId =
        isPlainObject(data) && typeof data.media_id === "string"
          ? data.media_id.trim()
          : "";
      if (!mediaId) {
        throw new CliError(
          "Remote operation result is unknown; verify before retrying",
          4,
        );
      }
      service.draft_media_id = mediaId;
    }
    service.draft_status = "saved";
    await saveConfirmedState(serviceFile, service);
    return {
      status: existingId ? "updated" : "saved",
      media_id: mediaId,
      article_dir: x.dir,
      service_file: serviceFile,
      uploaded_images_reused: reusedImages,
    };
  } catch (error) {
    const failure = error instanceof CliError ? error : remoteWriteError(error);
    service.draft_status = failure.code === 4 ? "unknown" : "failed";
    return await saveFailureState(serviceFile, service, failure);
  }
}

export async function syncDraft(
  workspace: string,
  input: string,
  credentials?: { appId: string; appSecret: string },
): Promise<RecordValue> {
  const resolvedCredentials = credentials ?? (await readCredentials());
  const dir = await articleDirectory(workspace, input);
  const lockFile = resolve(dir, ".service-sync.lock");
  let lock: FileHandle;
  try {
    lock = await open(lockFile, "wx", 0o600);
  } catch {
    throw new CliError(
      "Remote operation result is unknown; verify before retrying",
      4,
    );
  }
  try {
    return await syncDraftLocked(workspace, input, resolvedCredentials);
  } finally {
    try {
      await lock.close();
    } finally {
      try {
        await unlink(lockFile);
      } catch {
        // A leftover lock is safer than allowing a duplicate create.
      }
    }
  }
}
