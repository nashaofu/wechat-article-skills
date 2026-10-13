const commandGroups = {
  config: ["init", "status"],
  draft: ["get", "list", "sync"],
} as const;

export const CLI_NAME = "wechat-article";

type CommandGroup = keyof typeof commandGroups;
type SubcommandName = {
  [Group in CommandGroup]: `${Group}.${(typeof commandGroups)[Group][number]}`;
}[CommandGroup];

export type CommandName = CommandGroup | SubcommandName;

function isCommandGroup(value: string): value is CommandGroup {
  return Object.hasOwn(commandGroups, value);
}

export function writeSuccess(command: CommandName, data: unknown): void {
  process.stdout.write(
    `${JSON.stringify({ status: "success", command, data })}\n`,
  );
}

export function writeError(
  command: string,
  status: "error" | "unknown",
  code: string,
  message: string,
  details?: Record<string, unknown>,
): void {
  process.stderr.write(
    `${JSON.stringify({
      status,
      command,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    })}\n`,
  );
}

export function commandFromArgs(args: string[]): string {
  const [group, subcommand] = args;
  if (!group) {
    return CLI_NAME;
  }
  if (!isCommandGroup(group)) {
    return CLI_NAME;
  }
  const subcommands: readonly string[] = commandGroups[group];
  return subcommand && subcommands.includes(subcommand)
    ? (`${group}.${subcommand}` as CommandName)
    : group;
}

export function errorCode(exitCode: number): string {
  if (exitCode === 2) {
    return "COMMAND_BLOCKED";
  }
  if (exitCode === 3) {
    return "WECHAT_API_ERROR";
  }
  if (exitCode === 4) {
    return "REMOTE_RESULT_UNKNOWN";
  }
  return "INTERNAL_ERROR";
}
