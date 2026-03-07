import path from "node:path";
import { asNumber, asString } from "../utils.js";
import { DEFAULT_GRACE_SEC, DEFAULT_TIMEOUT_SEC, MAX_GRACE_SEC, MAX_TIMEOUT_SEC } from "./constants.js";

const SHELL_COMMANDS = new Set(["bash", "sh", "cmd.exe", "powershell.exe", "pwsh"]);
const SHELL_CODE_ARGS = new Set(["-c", "/c", "-Command"]);

export function validateProcessConfig(
  config: Record<string, unknown>,
  _options?: { companyId?: string },
): void {
  const command = asString(config.command, "").trim();
  if (!command) {
    throw new Error("Process adapter requires adapterConfig.command (non-empty string)");
  }

  const rawTimeout = asNumber(config.timeoutSec, DEFAULT_TIMEOUT_SEC);
  const rawGrace = asNumber(config.graceSec, DEFAULT_GRACE_SEC);
  if (rawTimeout < 0 || !Number.isFinite(rawTimeout)) {
    throw new Error(
      `Process adapter timeoutSec must be 0 or positive. Max: ${MAX_TIMEOUT_SEC}. Use timeoutSec (number) in adapterConfig.`,
    );
  }
  if (rawGrace < 0 || !Number.isFinite(rawGrace)) {
    throw new Error(
      `Process adapter graceSec must be 0 or positive. Max: ${MAX_GRACE_SEC}. Use graceSec (number) in adapterConfig.`,
    );
  }
  const timeoutSec = Math.min(MAX_TIMEOUT_SEC, Math.max(0, rawTimeout === 0 ? DEFAULT_TIMEOUT_SEC : rawTimeout));
  const graceSec = Math.min(MAX_GRACE_SEC, Math.max(0, rawGrace === 0 ? DEFAULT_GRACE_SEC : rawGrace));
  if (timeoutSec > MAX_TIMEOUT_SEC || graceSec > MAX_GRACE_SEC) {
    throw new Error(
      `Process adapter caps: timeoutSec <= ${MAX_TIMEOUT_SEC}, graceSec <= ${MAX_GRACE_SEC}.`,
    );
  }

  const allowlistRaw = process.env.PAPERCLIP_PROCESS_ADAPTER_ALLOWLIST;
  if (typeof allowlistRaw === "string" && allowlistRaw.trim().length > 0) {
    const allowlist = allowlistRaw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (allowlist.length > 0) {
      const basename = path.basename(command).toLowerCase();
      const allowed = allowlist.some((a) => basename === a || command.toLowerCase().endsWith(path.sep + a));
      if (!allowed) {
        throw new Error(
          "Process adapter command is not in the allowlist. Set PAPERCLIP_PROCESS_ADAPTER_ALLOWLIST to allow additional commands.",
        );
      }
    }
  }

  const allowShell =
    config.allowShell === true || process.env.PAPERCLIP_PROCESS_ADAPTER_ALLOW_SHELL === "true";
  if (!allowShell) {
    const cmdBasename = path.basename(command).toLowerCase().replace(/\.[^.]+$/, "");
    const isShell = SHELL_COMMANDS.has(cmdBasename) || SHELL_COMMANDS.has(path.basename(command).toLowerCase());
    if (isShell) {
      const args = Array.isArray(config.args)
        ? config.args
        : typeof config.args === "string"
          ? [config.args]
          : [];
      const firstArg = typeof args[0] === "string" ? args[0].trim() : "";
      if (SHELL_CODE_ARGS.has(firstArg)) {
        throw new Error(
          "Process adapter does not allow shell invocations. Set allowShell in adapterConfig or PAPERCLIP_PROCESS_ADAPTER_ALLOW_SHELL=true to override.",
        );
      }
    }
  }
}
