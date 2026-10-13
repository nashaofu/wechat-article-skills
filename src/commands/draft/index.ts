import { noop } from "lodash-es";
import type { ArgumentsCamelCase, Argv } from "yargs";
import { writeSuccess } from "../../output.js";
import { getDraft } from "./get.js";
import { listDrafts } from "./list.js";
import { syncDraft } from "./sync.js";

interface GetArgs {
  "media-id": string;
}

interface ListArgs {
  offset?: number;
  count?: number;
}

interface SyncArgs {
  dir: string;
}

export default {
  command: "draft",
  describe: "Check and manage WeChat drafts",
  builder: (yargs: Argv) =>
    yargs
      .command({
        command: "get",
        describe: "Read WeChat draft metadata",
        builder: (yargs: Argv) =>
          yargs
            .option("media-id", {
              type: "string",
              demandOption: true,
              describe: "Draft media ID",
            })
            .check(({ mediaId }) => {
              if (typeof mediaId === "string" && mediaId.trim().length > 0) {
                return true;
              } else {
                return "media-id must be valid";
              }
            }),
        handler: async (args: ArgumentsCamelCase<GetArgs>) => {
          const result = await getDraft(args.mediaId);
          writeSuccess("draft.get", result);
        },
      })
      .command({
        command: "list",
        describe: "List WeChat drafts",
        builder: (yargs: Argv) =>
          yargs
            .option("offset", {
              type: "number",
              default: 0,
              describe: "Starting offset",
            })
            .option("count", {
              type: "number",
              default: 20,
              describe: "Number of drafts to return",
            })
            .check(({ offset, count }) => {
              if (
                typeof offset === "number" &&
                Number.isInteger(offset) &&
                offset >= 0 &&
                typeof count === "number" &&
                Number.isInteger(count) &&
                count > 0
              ) {
                return true;
              } else {
                return "offset and count must be valid integers";
              }
            }),
        handler: async (args: ArgumentsCamelCase<ListArgs>) => {
          const result = await listDrafts(args.offset ?? 0, args.count ?? 20);
          writeSuccess("draft.list", result);
        },
      })
      .command({
        command: "sync",
        describe:
          "Validate article files and create or update the WeChat draft",
        builder: (yargs: Argv) =>
          yargs.option("dir", {
            type: "string",
            demandOption: true,
            describe: "Article directory",
          }),
        handler: async (args: ArgumentsCamelCase<SyncArgs>) => {
          const result = await syncDraft(process.cwd(), args.dir);
          writeSuccess("draft.sync", {
            action: result.status,
            media_id: result.media_id,
            article_dir: result.article_dir,
            service_file: result.service_file,
            uploaded_images_reused: result.uploaded_images_reused,
          });
        },
      })
      .demandCommand(1, "Please specify a draft subcommand")
      .strictCommands(),
  handler: noop,
};
