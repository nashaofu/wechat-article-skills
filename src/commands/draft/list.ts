import { CliError } from "../../errors.js";
import {
  type ApiResponse,
  apiResponseError,
  fetchAccessToken,
  isApiErrorResponse,
  readApiError,
  wechatApi,
} from "./api.js";

interface DraftListSuccess {
  total_count: number;
  item: { media_id: string; update_time?: number }[];
}

export async function listDrafts(offset: number, count: number) {
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 20
  ) {
    throw new CliError(
      "offset must be non-negative and count must be between 1 and 20",
      2,
    );
  }

  const token = await fetchAccessToken();
  let data: ApiResponse<DraftListSuccess>;
  try {
    ({ data } = await wechatApi.post<ApiResponse<DraftListSuccess>>(
      "/cgi-bin/draft/batchget",
      { offset, count, no_content: 1 },
      { params: { access_token: token } },
    ));
  } catch (error) {
    throw readApiError(error, "draft_list");
  }

  if (isApiErrorResponse(data)) {
    throw apiResponseError(data, "draft_list");
  }
  if (
    !("item" in data) ||
    !Array.isArray(data.item) ||
    typeof data.total_count !== "number"
  ) {
    throw apiResponseError(data, "draft_list");
  }

  return {
    total_count: data.total_count,
    items: data.item.map(({ media_id, update_time }) => ({
      media_id,
      update_time: update_time ?? null,
    })),
  };
}
