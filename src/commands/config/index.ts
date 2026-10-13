import { noop } from "lodash-es";
import type { Argv } from "yargs";
import { writeSuccess } from "../../output.js";
import { initConfig } from "./init.js";
import { getConfigStatus } from "./status.js";

export default {
  command: "config",
  describe: "Configure WeChat Official Account credentials",
  builder: (yargs: Argv) =>
    yargs
      .command({
        command: "init",
        describe: "Configure WeChat Official Account credentials",
        builder: (yargs: Argv) => yargs,
        handler: async () => {
          const result = await initConfig();
          writeSuccess("config.init", {
            credentials: result.credentials,
            credentials_status: result.credentials_status,
          });
        },
      })
      .command({
        command: "status",
        describe: "Check whether WeChat credentials are configured",
        builder: (yargs: Argv) => yargs,
        handler: async () => {
          const result = await getConfigStatus();
          writeSuccess("config.status", result);
        },
      })
      .demandCommand(1, "Please specify a config subcommand")
      .strictCommands(),
  handler: noop,
};
