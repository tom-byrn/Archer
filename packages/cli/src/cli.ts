#!/usr/bin/env node
import { parseArgs } from "node:util";
import { EXIT, UsageError, check, fmt, init, list, login, pull, push } from "./commands";

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
      --title <t>  --key <k>  --no-mcp
  archer guide                 Print the language specification

  archer login [key]           Save an API key to ~/.archer/key (or pipe it on stdin)
  archer list [--json]         Projects in your workspace
  archer push <file>           Create the file's project, or update the linked one
      --project <id>  -m, --message <summary>
  archer pull <file>           Overwrite the file with the project's saved source
      --project <id>  --force
  archer mcp                   Run the Archer MCP server over stdio

"-" as a path reads stdin (check, fmt). File ↔ project links live in ./archer.json.
Exit codes: 0 ok · 1 documents have problems · 2 usage, IO or auth error
Env: ARCHER_API_KEY, CONVEX_URL, ARCHER_APP_URL, ARCHER_AGENT_NAME`;

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
      key: { type: "string" },
      "no-mcp": { type: "boolean" },
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
      return init(rest[0], { title: values.title, key: values.key, mcp: !values["no-mcp"] });
    case "guide":
      console.log((await import("@archer/mcp/languageSpec")).LANGUAGE_SPEC);
      return EXIT.ok;
    case "login":
      return login(rest[0]);
    case "list":
      return list(values);
    case "push":
      return push(one("file"), values);
    case "pull":
      return pull(one("file"), values);
    case "mcp":
      // The stdio transport keeps the process alive until the client
      // disconnects; stdout belongs to the protocol from here on.
      await (await import("@archer/mcp/server")).startServer();
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
