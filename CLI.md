# CLI Reference

Requires Node.js 20.19+, 22.12+, or 23+.

## Output contract

Commands write one compact JSON object followed by a newline to stdout on success. Every success uses `status: "success"`, a stable command name, and a `data` object:

| Command | `command` | `data` fields |
| --- | --- | --- |
| `config init` | `config.init` | `credentials`, `credentials_status` (`created`, `updated`, or `existing`) |
| `config status` | `config.status` | `credentials`, `credentials_status` (`missing`, `configured`, or `incomplete`) |
| `draft get` | `draft.get` | `media_id`, `articles` (title and digest) |
| `draft list` | `draft.list` | `total_count`, `items` (media ID and update time) |
| `draft sync` | `draft.sync` | `action` (`saved` or `updated`), `media_id`, `article_dir`, `service_file`, `uploaded_images_reused` |

For example, `draft list` can return:

```json
{"status":"success","command":"draft.list","data":{"total_count":1,"items":[{"media_id":"example-id","update_time":1710000000}]}}
```

Failures write one JSON object followed by a newline to stderr and leave stdout empty. The object has a stable command name and `error: {code, message, details?}`. A remote write with an uncertain result uses `status: "unknown"`; other failures use `status: "error"`. It never includes credentials, access tokens, or complete requests. The process exit code determines the error category:

| Exit code | Error `code` | Meaning |
| --- | --- | --- |
| 1 | `INTERNAL_ERROR` | Unexpected local or runtime failure |
| 2 | `COMMAND_BLOCKED` | Invalid input, missing prerequisites, or a rejected command |
| 3 | `WECHAT_API_ERROR` | WeChat API or network failure |
| 4 | `REMOTE_RESULT_UNKNOWN` | A remote write may have succeeded, or the CLI could not acquire the article sync lock; inspect the account and sync state before retrying |

For example, invalid input returns exit code 2 with:

```json
{"status":"error","command":"draft.list","error":{"code":"COMMAND_BLOCKED","message":"offset must be non-negative and count must be between 1 and 20"}}
```

`--help` and `--version` print human-readable text instead of JSON. `config init` writes interactive prompts to stderr before its final result; scripts should use the exit code and read the final JSON line. These output fields describe CLI results and are separate from `service.json` state.

## Account setup

Run `wechat-article config status` to check credentials without displaying them or changing files. `credentials_status` is `missing`, `configured`, or `incomplete`; malformed JSON or an unreadable file returns an error without exposing its contents. Run `wechat-article config init` to configure the single WeChat Official Account. Credentials are stored in `~/.wechat-article/config.json`, and replacing existing credentials requires confirmation. The CLI does not install itself globally or read workspace configuration files or secrets from environment variables.

From a repository checkout, install dependencies and build the CLI with `pnpm install --frozen-lockfile` and `pnpm run build`. Run it locally as `node dist/index.js <command>`. To install the checked-out package globally and use the `wechat-article` command, run `npm install --global .` from the repository root. This installation does not configure credentials.

## Article files

Each article directory requires `article.json` and its referenced files. The CLI creates and maintains `service.json`. Other file names and directory layouts are unrestricted.

`article.json` contains the top-level fields `title`, `author`, `digest`, `content_source_url`, `markdown`, `html`, `cover`, and `images`, plus `$schema`. `content_source_url` must be empty or an HTTPS URL. Paths are resolved relative to the article directory and must remain inside it.

`service.json` is created and maintained by the CLI. It contains `$schema`, a SHA-256 `account_hash` of the configured AppID, an optional `cover` object, body image records, `draft_media_id`, and `draft_status`. Image records use `sha256:<hash>` keys. The cover record stores the WeChat media ID; body image records store the returned URL. Status values prevent blind retries when a remote result is uncertain. If a service file has existing remote records but no `account_hash`, sync is blocked until the account is verified and the state is migrated. An empty state file can be bound to the configured account; the CLI will not guess which account owns existing remote IDs.

## Draft commands

```sh
wechat-article draft sync --dir drafts/20261014-example-topic
```

Before requesting an access token, checks manifest fields and path containment, referenced files, image extensions and sizes, blocked HTML elements/attributes, placeholders, and local HTML image references. It does not compare Markdown and HTML content or check whether article hyperlinks are reachable; those are Agent editorial checks described in the Skill. Image type is inferred from the file extension and is not verified from file contents. The cover is uploaded through `material/add_material`; body images use `media/uploadimg`. Previously uploaded images are reused when their content hashes match. Local image references in HTML are replaced with the URLs returned by WeChat.

Cover files with PNG, GIF, or JPEG extensions are accepted up to 10 MB. Body image files with PNG or JPEG extensions are accepted up to 1 MB, matching the MIME types sent to `media/uploadimg`.

If `draft_media_id` is absent, `draft/add` creates a draft and the returned `media_id` is saved. If an ID exists, `draft/update` updates that draft. The command does not publish or mass-send articles.

Draft sync changes the account's draft box. An explicit request in the current prompt to sync this article to the draft box is the authorization for that operation; do not run it without such a request, and do not ask for the same confirmation again. The authorization does not extend to mass-send, publishing, or other drafts. If a remote write result is uncertain, the CLI records `unknown` and blocks automatic retry. Exit code 4 can also mean the CLI could not acquire `.service-sync.lock` (for example, another sync may be running or a stale lock file remains); check for an active sync and inspect the WeChat Official Account backend before retrying. A leftover lock is deliberately retained when the CLI cannot safely remove it.

```sh
wechat-article draft get --media-id <draft-id>
wechat-article draft list
```

`draft get` reads one draft. `draft list` lists drafts.
