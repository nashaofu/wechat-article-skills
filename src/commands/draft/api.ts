import axios from "axios";
import { isPlainObject } from "lodash-es";
import { ACCESS_TOKEN_CACHE_PATH } from "../../constants.js";
import { CliError } from "../../errors.js";
import {
  type RecordValue,
  readCredentials,
  readJson,
  sha256,
  writeJsonAtomic,
} from "../../utils.js";

export interface WeChatApiError {
  errcode: number;
  errmsg: string;
}

export type ApiResponse<A> = A | WeChatApiError;

interface AccessTokenSuccess {
  access_token: string;
  expires_in: number;
}

interface AccessTokenCacheEntry {
  appId: string;
  appSecretHash: string;
  promise: Promise<string>;
  expiresAt?: number;
}

let accessTokenCache: AccessTokenCacheEntry | undefined;

export const wechatApi = axios.create({
  baseURL: "https://api.weixin.qq.com",
  timeout: 60000,
  maxRedirects: 0,
});

export function isApiErrorResponse(value: unknown): value is WeChatApiError {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const response = value as RecordValue;
  return (
    typeof response.errcode === "number" &&
    Number.isInteger(response.errcode) &&
    response.errcode !== 0
  );
}

export function readApiError(error: unknown, operation: string): CliError {
  const code = axios.isAxiosError(error) ? error.code : undefined;
  const httpStatus = axios.isAxiosError(error)
    ? error.response?.status
    : undefined;
  return new CliError(
    code === "EACCES" || code === "EPERM"
      ? "WeChat API network access denied"
      : "WeChat API request failed",
    3,
    {
      operation,
      ...(code ? { network_code: code } : {}),
      ...(httpStatus ? { http_status: httpStatus } : {}),
    },
  );
}

export function apiResponseError(data: unknown, operation: string): CliError {
  if (isApiErrorResponse(data)) {
    return new CliError("WeChat API rejected the request", 3, {
      operation,
      wechat_errcode: data.errcode,
    });
  }
  return new CliError("Unexpected WeChat API response", 3, {
    operation,
    reason: "unexpected_response",
  });
}

export async function fetchAccessToken(): Promise<string> {
  return fetchAccessTokenFor(await readCredentials());
}

export async function fetchAccessTokenFor(credentials: {
  appId: string;
  appSecret: string;
}): Promise<string> {
  const { appId, appSecret } = credentials;
  if (!appId || !appSecret) {
    throw new CliError(
      "WeChat credentials are missing; run `wechat-article config init`",
      2,
    );
  }
  const appSecretHash = sha256(appSecret);

  const cached = accessTokenCache;
  if (
    cached?.appId === appId &&
    cached.appSecretHash === appSecretHash &&
    (cached.expiresAt === undefined || cached.expiresAt > Date.now())
  ) {
    return cached.promise;
  }

  const diskCache = await readAccessTokenCache(appId, appSecretHash);
  if (diskCache) {
    const promise = Promise.resolve(diskCache.token);
    accessTokenCache = {
      appId,
      appSecretHash,
      promise,
      expiresAt: diskCache.expiresAt,
    };
    return promise;
  }

  let cacheEntry: AccessTokenCacheEntry | undefined;
  const promise = requestAccessToken(appId, appSecret)
    .then(async (result) => {
      if (cacheEntry && accessTokenCache === cacheEntry) {
        const lifetime = result.expiresIn * 1000;
        if (lifetime > 0) {
          const safetyMargin = Math.min(60_000, lifetime * 0.1);
          const expiresAt = Date.now() + lifetime - safetyMargin;
          cacheEntry.expiresAt = expiresAt;
          try {
            await writeJsonAtomic(ACCESS_TOKEN_CACHE_PATH, {
              appId,
              appSecretHash,
              token: result.token,
              expiresAt,
            });
          } catch {
            // Keep the in-memory token if the optional disk cache cannot be written.
          }
        } else {
          accessTokenCache = undefined;
        }
      }
      return result.token;
    })
    .catch((error: unknown) => {
      if (cacheEntry && accessTokenCache === cacheEntry) {
        accessTokenCache = undefined;
      }
      throw error;
    });

  cacheEntry = { appId, appSecretHash, promise };
  accessTokenCache = cacheEntry;
  return promise;
}

async function readAccessTokenCache(
  appId: string,
  appSecretHash: string,
): Promise<{ token: string; expiresAt: number } | undefined> {
  try {
    const cache = await readJson(ACCESS_TOKEN_CACHE_PATH);
    if (
      cache.appId === appId &&
      cache.appSecretHash === appSecretHash &&
      typeof cache.token === "string" &&
      cache.token.length > 0 &&
      typeof cache.expiresAt === "number" &&
      cache.expiresAt > Date.now()
    ) {
      return { token: cache.token, expiresAt: cache.expiresAt };
    }
  } catch {
    // Ignore an invalid cache and request a fresh token.
  }
  return undefined;
}

async function requestAccessToken(
  appId: string,
  appSecret: string,
): Promise<{ token: string; expiresIn: number }> {
  let data: ApiResponse<AccessTokenSuccess>;
  try {
    ({ data } = await wechatApi.get<ApiResponse<AccessTokenSuccess>>(
      "/cgi-bin/token",
      {
        params: {
          grant_type: "client_credential",
          appid: appId,
          secret: appSecret,
        },
      },
    ));
  } catch (error) {
    throw readApiError(error, "access_token");
  }
  if (isApiErrorResponse(data)) {
    throw apiResponseError(data, "access_token");
  }
  if (
    !isPlainObject(data) ||
    typeof data.access_token !== "string" ||
    !data.access_token.trim() ||
    typeof data.expires_in !== "number" ||
    !Number.isFinite(data.expires_in) ||
    data.expires_in <= 0
  ) {
    throw apiResponseError(data, "access_token");
  }
  return { token: data.access_token, expiresIn: data.expires_in };
}
