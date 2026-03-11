import type { CreateConfigValues } from "@paperclipai/adapter-utils";

export function buildOpenClawGatewayConfig(v: CreateConfigValues): Record<string, unknown> {
  const ac: Record<string, unknown> = {};
  if (v.url) ac.url = v.url;
  if (v.gatewayVariant === "moltis") ac.gatewayVariant = "moltis";
  ac.timeoutSec = 120;
  ac.waitTimeoutMs = 120000;
  ac.sessionKeyStrategy = "issue";
  ac.role = "operator";
  ac.scopes = ["operator.admin"];
  return ac;
}
