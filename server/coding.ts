import { spawn } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import path from "node:path";
import { HTTPError } from "./workspaces";
import type { CodingConfig } from "./connections";

const TOKENS = new Set(["{issueId}", "{title}", "{repoPath}"]);
export const CODING_TIMEOUT_MS = 30 * 60 * 1000;

export function boundArgv(config: CodingConfig, vars: { issueId: string; title: string }) {
  if (!Array.isArray(config.argv) || !config.argv.length || config.argv.some((part) => typeof part !== "string"))
    throw new HTTPError(400, "Configure the Coding session command as an argument list.");
  const cwd = path.resolve(config.cwd);
  if (!path.isAbsolute(cwd)) throw new HTTPError(400, "Coding session working directory must be an absolute path.");
  try {
    if (!statSync(cwd).isDirectory()) throw Error();
  } catch {
    throw new HTTPError(400, "Coding session working directory does not exist.");
  }
  const resolved = realpathSync(cwd);
  const values: Record<string, string> = { "{issueId}": vars.issueId, "{title}": vars.title, "{repoPath}": resolved };
  return {
    cwd: resolved,
    argv: config.argv.map((arg) => {
      if (TOKENS.has(arg)) return values[arg];
      if (arg.includes("{") || arg.includes("}")) throw new HTTPError(400, "Substitutions must be whole arguments.");
      return arg;
    }),
  };
}

export function runCodingCommand(argv: string[], cwd: string) {
  return new Promise<{ status: "completed" | "failed"; log: string }>((resolve) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: process.env.LANG },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    const append = (chunk: Buffer) => {
      log += chunk.toString("utf8");
      if (log.length > 200_000) log = `${log.slice(-200_000)}\n…truncated`;
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, CODING_TIMEOUT_MS);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ status: "failed", log: `${log}\n${error.message}`.trim() });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ status: code === 0 ? "completed" : "failed", log: log.trim() || `Process exited with ${code ?? "signal"}.` });
    });
  });
}
