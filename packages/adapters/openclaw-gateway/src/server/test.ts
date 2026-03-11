import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";
import { randomUUID } from "node:crypto";
import https from "node:https";
import { WebSocket } from "ws";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isLoopbackHost(hostname: string): boolean {
  const value = hostname.trim().toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1";
}

function toStringRecord(value: unknown): Record<string, string> {
  const parsed = parseObject(value);
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(parsed)) {
    if (typeof entry === "string") out[key] = entry;
  }
  return out;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function headerMapGetIgnoreCase(headers: Record<string, string>, key: string): string | null {
  const match = Object.entries(headers).find(([entryKey]) => entryKey.toLowerCase() === key.toLowerCase());
  return match ? match[1] : null;
}

function tokenFromAuthHeader(rawHeader: string | null): string | null {
  if (!rawHeader) return null;
  const trimmed = rawHeader.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^bearer\s+(.+)$/i);
  return match ? nonEmpty(match[1]) : trimmed;
}

function resolveAuthToken(config: Record<string, unknown>, headers: Record<string, string>): string | null {
  const explicit = nonEmpty(config.authToken) ?? nonEmpty(config.token);
  if (explicit) return explicit;

  const tokenHeader = headerMapGetIgnoreCase(headers, "x-openclaw-token");
  if (nonEmpty(tokenHeader)) return nonEmpty(tokenHeader);

  const authHeader =
    headerMapGetIgnoreCase(headers, "x-openclaw-auth") ??
    headerMapGetIgnoreCase(headers, "authorization");
  return tokenFromAuthHeader(authHeader);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function rawDataToString(data: unknown): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (Array.isArray(data)) {
    return Buffer.concat(
      data.map((entry) => (Buffer.isBuffer(entry) ? entry : Buffer.from(String(entry), "utf8"))),
    ).toString("utf8");
  }
  return String(data ?? "");
}

type ProbeResult =
  | "ok"
  | "challenge_only"
  | "failed"
  | "agent_not_configured"
  | "agent_probe_timeout";

const AGENT_PROBE_TIMEOUT_MS = 8_000;

async function probeGateway(input: {
  url: string;
  headers: Record<string, string>;
  authToken: string | null;
  role: string;
  scopes: string[];
  timeoutMs: number;
  /** When true (Moltis), send connect immediately with protocol 4; do not wait for connect.challenge. */
  clientFirst?: boolean;
}): Promise<ProbeResult> {
  return await new Promise((resolve) => {
    const wsOptions: { headers: Record<string, string>; maxPayload: number; agent?: import("node:https").Agent } = {
      headers: input.headers,
      maxPayload: 2 * 1024 * 1024,
    };
    try {
      const parsed = new URL(input.url);
      if (parsed.protocol === "wss:" && isLoopbackHost(parsed.hostname)) {
        wsOptions.agent = new https.Agent({ rejectUnauthorized: false });
      }
    } catch {
      // leave agent unset for invalid URLs
    }
    const ws = new WebSocket(input.url, wsOptions);
    let timeoutHandle: ReturnType<typeof setTimeout> = setTimeout(() => {
      try {
        ws.close();
      } catch {
        // ignore
      }
      resolve("failed");
    }, input.timeoutMs);

    let completed = false;
    let connectReqId: string | null = null;
    let agentReqId: string | null = null;

    const finish = (status: ProbeResult) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeoutHandle);
      try {
        ws.close();
      } catch {
        // ignore
      }
      resolve(status);
    };

    const sendConnect = (protocolVersion: 3 | 4) => {
      connectReqId = randomUUID();
      ws.send(
        JSON.stringify({
          type: "req",
          id: connectReqId,
          method: "connect",
          params: {
            minProtocol: protocolVersion,
            maxProtocol: protocolVersion,
            client: {
              id: "gateway-client",
              version: "squadron-probe",
              platform: process.platform,
              mode: "probe",
            },
            role: input.role,
            scopes: input.scopes,
            ...(input.authToken
              ? {
                  auth: {
                    token: input.authToken,
                  },
                }
              : {}),
          },
        }),
      );
    };

    const sendAgentProbe = () => {
      agentReqId = randomUUID();
      const agentParams = {
        message: "Squadron adapter probe.",
        sessionKey: "squadron-probe",
        idempotencyKey: agentReqId,
        timeout: 5_000,
      };
      ws.send(
        JSON.stringify({
          type: "req",
          id: agentReqId,
          method: "agent",
          params: agentParams,
        }),
      );
      timeoutHandle = setTimeout(() => {
        finish("agent_probe_timeout");
      }, AGENT_PROBE_TIMEOUT_MS);
    };

    const onConnectSuccess = () => {
      clearTimeout(timeoutHandle);
      sendAgentProbe();
    };

    ws.on("open", () => {
      if (input.clientFirst) {
        sendConnect(4);
      }
    });

    ws.on("message", (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawDataToString(raw));
      } catch {
        return;
      }
      const event = asRecord(parsed);
      if (event?.type === "res") {
        const id = event.id;
        if (agentReqId != null && String(id) === agentReqId) {
          clearTimeout(timeoutHandle);
          if (event.ok === true) {
            finish("ok");
          } else {
            const errObj = asRecord(event.error);
            const payloadObj = asRecord(event.payload);
            const errorMsg =
              typeof event.error === "string"
                ? event.error
                : nonEmpty(errObj?.message) ??
                  nonEmpty(payloadObj?.error) ??
                  nonEmpty(payloadObj?.summary) ??
                  nonEmpty(payloadObj?.message) ??
                  "";
            const lower = errorMsg.toLowerCase();
            if (lower.includes("agent service not configured")) {
              finish("agent_not_configured");
            } else {
              finish("failed");
            }
          }
          return;
        }
        if (connectReqId != null && String(id) === connectReqId) {
          if (event.ok === true) {
            onConnectSuccess();
          } else {
            finish("challenge_only");
          }
        } else if (!input.clientFirst && event.ok === true) {
          onConnectSuccess();
        } else if (!input.clientFirst) {
          finish("challenge_only");
        }
        return;
      }
      if (input.clientFirst && agentReqId != null) return;
      if (event?.type === "event" && event.event === "connect.challenge") {
        const nonce = nonEmpty(asRecord(event.payload)?.nonce);
        if (!nonce) {
          finish("failed");
          return;
        }
        sendConnect(3);
      }
    });

    ws.on("error", () => {
      finish("failed");
    });

    ws.on("close", () => {
      if (!completed) finish("failed");
    });
  });
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const urlValue = asString(config.url, "").trim();

  if (!urlValue) {
    checks.push({
      code: "openclaw_gateway_url_missing",
      level: "error",
      message: "OpenClaw gateway adapter requires a WebSocket URL.",
      hint: "Set adapterConfig.url to ws://host:port (or wss://).",
    });
    return {
      adapterType: ctx.adapterType,
      status: summarizeStatus(checks),
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  let url: URL | null = null;
  try {
    url = new URL(urlValue);
  } catch {
    checks.push({
      code: "openclaw_gateway_url_invalid",
      level: "error",
      message: `Invalid URL: ${urlValue}`,
    });
  }

  if (url && url.protocol !== "ws:" && url.protocol !== "wss:") {
    checks.push({
      code: "openclaw_gateway_url_protocol_invalid",
      level: "error",
      message: `Unsupported URL protocol: ${url.protocol}`,
      hint: "Use ws:// or wss://.",
    });
  }

  if (url) {
    checks.push({
      code: "openclaw_gateway_url_valid",
      level: "info",
      message: `Configured gateway URL: ${url.toString()}`,
    });

    if (url.protocol === "ws:" && !isLoopbackHost(url.hostname)) {
      checks.push({
        code: "openclaw_gateway_plaintext_remote_ws",
        level: "warn",
        message: "Gateway URL uses plaintext ws:// on a non-loopback host.",
        hint: "Prefer wss:// for remote gateways.",
      });
    }
  }

  const headers = toStringRecord(config.headers);
  const authToken = resolveAuthToken(config, headers);
  const password = nonEmpty(config.password);
  const role = nonEmpty(config.role) ?? "operator";
  const scopes = toStringArray(config.scopes);

  if (authToken || password) {
    checks.push({
      code: "openclaw_gateway_auth_present",
      level: "info",
      message: "Gateway credentials are configured.",
    });
  } else {
    checks.push({
      code: "openclaw_gateway_auth_missing",
      level: "warn",
      message: "No gateway credentials detected in adapter config.",
      hint: "Set authToken/password or headers.x-openclaw-token for authenticated gateways.",
    });
  }

  const gatewayVariant = asString(config.gatewayVariant, "").toLowerCase();
  const clientFirst = gatewayVariant === "moltis";

  if (url && (url.protocol === "ws:" || url.protocol === "wss:")) {
    try {
      const probeResult = await probeGateway({
        url: url.toString(),
        headers,
        authToken,
        role,
        scopes: scopes.length > 0 ? scopes : ["operator.admin"],
        timeoutMs: 4_000,
        clientFirst,
      });

      if (probeResult === "ok") {
        checks.push({
          code: "openclaw_gateway_probe_ok",
          level: "info",
          message: "Gateway connect probe succeeded.",
        });
        checks.push({
          code: "openclaw_gateway_agent_probe_ok",
          level: "info",
          message: "Gateway agent probe succeeded.",
        });
      } else if (probeResult === "agent_not_configured") {
        checks.push({
          code: "openclaw_gateway_probe_ok",
          level: "info",
          message: "Gateway connect probe succeeded.",
        });
        checks.push({
          code: "openclaw_gateway_agent_not_configured",
          level: "error",
          message:
            "Gateway agent service not configured; the Moltis binary may be gateway-only. See doc/MOLTIS_ONBOARDING.md.",
          hint: "Build Moltis from source with default features or use a full build that wires the agent service.",
        });
      } else if (probeResult === "agent_probe_timeout") {
        checks.push({
          code: "openclaw_gateway_probe_ok",
          level: "info",
          message: "Gateway connect probe succeeded.",
        });
        checks.push({
          code: "openclaw_gateway_agent_probe_timeout",
          level: "warn",
          message: "Agent probe timed out.",
          hint: "Gateway accepted connect but did not respond to agent request in time.",
        });
      } else if (probeResult === "challenge_only") {
        checks.push({
          code: "openclaw_gateway_probe_challenge_only",
          level: "warn",
          message: "Gateway challenge was received, but connect probe was rejected.",
          hint: "Check gateway credentials, scopes, role, and device-auth requirements.",
        });
      } else {
        checks.push({
          code: "openclaw_gateway_probe_failed",
          level: "warn",
          message: "Gateway probe failed.",
          hint: "Verify network reachability and gateway URL from the Squadron server host.",
        });
      }
    } catch (err) {
      checks.push({
        code: "openclaw_gateway_probe_error",
        level: "warn",
        message: err instanceof Error ? err.message : "Gateway probe failed",
      });
    }
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
