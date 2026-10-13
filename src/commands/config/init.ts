import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { confirm, input } from "@inquirer/prompts";
import { writeFile as writeFileAtomic } from "atomically";
import { CREDENTIALS_PATH } from "../../constants.js";
import { CliError } from "../../errors.js";
import { readCredentials } from "../../utils.js";

async function writeCredentials(
  appId: string,
  appSecret: string,
  overwrite = false,
): Promise<void> {
  await mkdir(resolve(CREDENTIALS_PATH, ".."), {
    recursive: true,
    mode: 0o700,
  });
  const contents = `${JSON.stringify({ appId, appSecret }, null, 2)}\n`;
  if (overwrite) {
    await writeFileAtomic(CREDENTIALS_PATH, contents, { mode: 0o600 });
  } else {
    await writeFile(CREDENTIALS_PATH, contents, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  }
}

export async function initConfig() {
  const globalFile = CREDENTIALS_PATH;
  let credentialsExist = true;
  let credentialsComplete = false;
  try {
    await access(globalFile);
  } catch {
    credentialsExist = false;
  }
  if (credentialsExist) {
    const current = await readCredentials();
    credentialsComplete = Boolean(current.appId && current.appSecret);
  }

  let appId = "";
  let appSecret = "";
  let credentialsOverwrite = false;
  const pipedLines: string[] = [];
  if (!process.stdin.isTTY) {
    let inputText = "";
    for await (const chunk of process.stdin) {
      inputText += chunk;
    }
    pipedLines.push(...inputText.split(/\r?\n/));
  }
  const ask = async (prompt: string): Promise<string> => {
    if (process.stdin.isTTY) {
      return input(
        { message: prompt },
        { input: process.stdin, output: process.stderr },
      );
    } else {
      process.stderr.write(`${prompt}\n`);
      return pipedLines.shift() ?? "";
    }
  };
  if (credentialsExist) {
    if (process.stdin.isTTY) {
      credentialsOverwrite = await confirm(
        {
          message: credentialsComplete
            ? `Global credentials already exist: ${globalFile}\nOverwrite them?`
            : `Global credentials are incomplete: ${globalFile}\nReplace them?`,
          default: false,
        },
        { input: process.stdin, output: process.stderr },
      );
    } else {
      const answer = await ask(
        credentialsComplete
          ? `Global credentials already exist: ${globalFile}\nOverwrite them? [y/N] `
          : `Global credentials are incomplete: ${globalFile}\nReplace them? [y/N] `,
      );
      credentialsOverwrite = /^\s*y(?:es)?\s*$/i.test(answer);
    }
  }
  if (credentialsExist && !credentialsComplete && !credentialsOverwrite) {
    throw new CliError(
      `Global credentials are incomplete; rerun config init and confirm replacement: ${globalFile}`,
      2,
    );
  }
  if (!credentialsExist || credentialsOverwrite) {
    if (process.stdin.isTTY) {
      appId = (await ask("WeChat AppID:")).trim();
      appSecret = (await ask("WeChat AppSecret:")).trim();
    } else {
      process.stderr.write("Enter AppID and AppSecret on separate lines:\n");
      appId = (pipedLines.shift() ?? "").trim();
      appSecret = (pipedLines.shift() ?? "").trim();
    }
  }
  if ((!credentialsExist || credentialsOverwrite) && !appId) {
    throw new CliError("AppID cannot be empty", 2);
  }
  if ((!credentialsExist || credentialsOverwrite) && !appSecret) {
    throw new CliError("AppSecret cannot be empty", 2);
  }

  if (!credentialsExist || credentialsOverwrite) {
    await writeCredentials(appId, appSecret, credentialsExist);
  }
  return {
    status: "configured",
    credentials: globalFile,
    credentials_status: credentialsOverwrite
      ? "updated"
      : credentialsExist
        ? "existing"
        : "created",
  };
}
