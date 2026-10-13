#!/usr/bin/env node
import yargs from "yargs";
import configCommand from "./commands/config/index.js";
import draftCommand from "./commands/draft/index.js";
import { CliError } from "./errors.js";
import { CLI_NAME, commandFromArgs, errorCode, writeError } from "./output.js";

try {
  await yargs()
    .locale("en")
    .scriptName(CLI_NAME)
    .command(configCommand)
    .command(draftCommand)
    .help()
    .alias("help", "h")
    .demandCommand(1, "Please specify a command to run")
    .strict()
    .exitProcess(false)
    .fail((message, error) => {
      throw error ?? new CliError(message, 2);
    })
    .parseAsync(process.argv.slice(2));
} catch (error) {
  const command = commandFromArgs(process.argv.slice(2));
  if (error instanceof Error && error.name === "YError") {
    writeError(command, "error", "INVALID_COMMAND", error.message);
    process.exitCode = 2;
  } else if (error instanceof CliError) {
    const status = error.code === 4 ? "unknown" : "error";
    writeError(
      command,
      status,
      errorCode(error.code),
      error.message,
      error.details,
    );
    process.exitCode = error.code;
  } else {
    writeError(
      command,
      "error",
      "INTERNAL_ERROR",
      "Command failed; check the input and runtime environment",
    );
    process.exitCode = 1;
  }
}
