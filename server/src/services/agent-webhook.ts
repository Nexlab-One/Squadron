import { createHmac } from "node:crypto";
import type { Db } from "@paperclipai/db";
import { agents } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { logger } from "../middleware/logger.js";

export const WORKABLE_STATUSES_FOR_WEBHOOK = ["todo", "in_progress"] as const;
export const WEBHOOK_RETRY_DELAYS_MS = [1000, 2000, 4000];
export const WEBHOOK_VERSION = 1;

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function isAllowedWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") return false;
    return true;
  } catch {
    return false;
  }
}

export function signWebhookPayload(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

export async function deliverWorkAvailable(
  agentId: string,
  companyId: string,
  issueId: string,
  db: Db,
): Promise<void> {
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!agent) return;

  const runtimeConfig = (agent.runtimeConfig ?? {}) as Record<string, unknown>;
  const webhookUrl = asNonEmptyString(runtimeConfig.webhookUrl);
  const webhookSecret =
    typeof runtimeConfig.webhookSecret === "string" && runtimeConfig.webhookSecret.length > 0
      ? runtimeConfig.webhookSecret
      : null;

  if (!webhookUrl || !webhookSecret) return;
  if (!isAllowedWebhookUrl(webhookUrl)) {
    logger.warn({ agentId, issueId }, "webhook URL invalid or not HTTPS in production; skipping delivery");
    return;
  }

  const payload = {
    event: "work_available",
    issueId,
    companyId,
    agentId,
    timestamp: new Date().toISOString(),
    version: WEBHOOK_VERSION,
  };
  const rawBody = JSON.stringify(payload);
  const signature = signWebhookPayload(rawBody, webhookSecret);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Paperclip-Signature": signature,
    "X-Paperclip-Webhook-Version": String(WEBHOOK_VERSION),
  };

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= WEBHOOK_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: rawBody,
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < WEBHOOK_RETRY_DELAYS_MS.length) {
      await new Promise((r) => setTimeout(r, WEBHOOK_RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastError;
}
