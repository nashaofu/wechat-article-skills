import { CliError } from "../../errors.js";
import {
  type ApiResponse,
  apiResponseError,
  fetchAccessToken,
  isApiErrorResponse,
  readApiError,
  wechatApi,
} from "./api.js";

interface DraftGetSuccess {
  news_item: { title: string; digest?: string }[];
}

export async function getDraft(mediaId: string) {
  if (!mediaId || mediaId.length > 256 || /\s/.test(mediaId)) {
    throw new CliError(
      "media-id must contain 1 to 256 non-whitespace characters",
      2,
    );
  }

  const token = await fetchAccessToken();
  let data: ApiResponse<DraftGetSuccess>;
  try {
    ({ data } = await wechatApi.post<ApiResponse<DraftGetSuccess>>(
      "/cgi-bin/draft/get",
      { media_id: mediaId },
      { params: { access_token: token } },
    ));
  } catch (error) {
    throw readApiError(error, "draft_get");
  }

  if (isApiErrorResponse(data)) {
    throw apiResponseError(data, "draft_get");
  }
  if (!("news_item" in data) || !Array.isArray(data.news_item)) {
    throw apiResponseError(data, "draft_get");
  }

  return {
    media_id: mediaId,
    articles: data.news_item.map(({ title, digest }) => ({
      title,
      digest: digest ?? "",
    })),
  };
}
