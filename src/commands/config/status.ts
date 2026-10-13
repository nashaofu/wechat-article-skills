import { access } from "node:fs/promises";
import { CREDENTIALS_PATH } from "../../constants.js";
import { CliError } from "../../errors.js";
import { readCredentials } from "../../utils.js";

export async function getConfigStatus() {
  try {
    await access(CREDENTIALS_PATH);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {
        credentials: CREDENTIALS_PATH,
        credentials_status: "missing" as const,
      };
    }
    throw new CliError("Unable to access the credentials file", 2);
  }

  const credentials = await readCredentials();
  return {
    credentials: CREDENTIALS_PATH,
    credentials_status:
      credentials.appId && credentials.appSecret
        ? ("configured" as const)
        : ("incomplete" as const),
  };
}
