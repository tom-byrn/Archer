#!/usr/bin/env node
import { parseArgs } from "node:util";
import { APP_URL } from "./config";
import { EXIT, UsageError, check, fmt, init, list, login, logout, pull, push, workspace } from "./commands";

const HELP = `archer — check, format and sync Archer (.arch) architecture files

Usage
  archer check [paths…]        Validate files (default: every .arch under .)
      --json                   Machine-readable report on stdout
      --offline                Skip workspace custom types (unknown types only warn)
  archer fmt [paths…]          Rewrite files in canonical form
      --check                  Don't write; exit 1 if anything would change
      --layout                 Also complete the layout block
      --drop-comments          Format files that have # comments (canonical form drops them)
  archer init [file]           Starter file (architecture.arch) + .mcp.json entry
      --title <t>  --no-mcp
  archer guide                 Print the language specification

  archer login                 Sign in with GitHub in your browser (MCP OAuth)
      --no-browser             Print the sign-in URL instead of opening it
  archer logout                Sign out on this machine
  archer workspace [id]        List your workspaces (* = current), or switch
  archer list [--json]         Projects in the current workspace
  archer push <file>           Create the file's project, or update the linked one
      --project <id>  -m, --message <summary>
  archer pull <file>           Overwrite the file with the project's saved source
      --project <id>  --force
  archer mcp                   The hosted MCP server over stdio, for clients
                               that only run local servers (uses your sign-in)

"-" as a path reads stdin (check, fmt). File ↔ project links live in ./archer.json;
the sign-in in ~/.archer/auth.json.
Exit codes: 0 ok · 1 documents have problems · 2 usage, IO or auth error
Env: ARCHER_APP_URL — the Archer app to talk to (now: ${APP_URL})`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      json: { type: "boolean" },
      offline: { type: "boolean" },
      check: { type: "boolean" },
      layout: { type: "boolean" },
      "drop-comments": { type: "boolean" },
      title: { type: "string" },
      "no-mcp": { type: "boolean" },
      "no-browser": { type: "boolean" },
      project: { type: "string" },
      message: { type: "string", short: "m" },
      force: { type: "boolean" },
    },
  });
  const [command, ...rest] = positionals;
  const one = (what: string): string => {
    if (rest.length !== 1) throw new UsageError(`archer ${command} takes exactly one ${what}.`);
    return rest[0]!;
  };

  if (values.version) {
    console.log(process.env.ARCHER_CLI_VERSION ?? "dev");
    return EXIT.ok;
  }
  if (values.help || command === undefined || command === "help") {
    console.log(HELP);
    return EXIT.ok;
  }

  switch (command) {
    case "check":
      return check(rest, values);
    case "fmt":
      return fmt(rest, values);
    case "init":
      return init(rest[0], { title: values.title, mcp: !values["no-mcp"] });
    case "guide":
      console.log((await import("@archer/mcp/languageSpec")).LANGUAGE_SPEC);
      return EXIT.ok;
    case "login":
      if (rest.length > 0) throw new UsageError("archer login takes no arguments: it signs in through the browser (API keys are gone).");
      return login({ browser: !values["no-browser"] });
    case "logout":
      return logout();
    case "workspace":
      if (rest.length > 1) throw new UsageError("archer workspace takes at most one workspace id.");
      return workspace(rest[0], values);
    case "list":
      return list(values);
    case "push":
      return push(one("file"), values);
    case "pull":
      return pull(one("file"), values);
    case "mcp":
      // stdout belongs to the protocol from here on; this returns when the
      // client disconnects.
      await (await import("./relay")).relay((line) => console.error(line));
      return EXIT.ok;
    default:
      throw new UsageError(`Unknown command "${command}". Run archer --help.`);
  }
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (e) {
  // parseArgs throws TypeError for unknown flags; backend failures land here too.
  console.error(`archer: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = EXIT.usage;
}
