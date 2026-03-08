import { createHmac } from "node:crypto";
import type { Db } from "@paperclipai/db";
import { agents } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { logger } from "../middleware/logger.js";

export const WORKABLE_STATUSES_FOR_WEBHOOK = ["todo", "in_progress"] as const;
export const WEBHOOK_RETRY_DELAYS_MS = [1000, 2000, 4000];
export const WEBHOOK_VERSION = 1;

/** Default jitter: ±20% on each retry delay to avoid thundering herd. */
export const WEBHOOK_JITTER_FRACTION = 0.2;

/** Circuit opens after this many failures within the failure window. */
const CIRCUIT_FAILURE_THRESHOLD = 5;
/** Failures older than this are not counted. */
const CIRCUIT_FAILURE_WINDOW_MS = 5 * 60 * 1000;
/** After this cooldown, circuit moves from open to half_open for one probe. */
const CIRCUIT_COOLDOWN_MS = 60 * 1000;

const FETCH_TIMEOUT_MS = 15000;

export type WebhookRetryConfig = {
  delaysMs: number[];
  jitterFraction: number;
};

const DEFAULT_RETRY_CONFIG: WebhookRetryConfig = {
  delaysMs: WEBHOOK_RETRY_DELAYS_MS,
  jitterFraction: WEBHOOK_JITTER_FRACTION,
};

type CircuitState = "closed" | "open" | "half_open";

type CircuitEntry = {
  state: CircuitState;
  failures: number;
  lastFailureAt: number;
  openedAt: number;
};

const circuitByAgentId = new Map<string, CircuitEntry>();

function now(): number {
  return Date.now();
}

function isRetriable(status: number | undefined, isNetworkOrTimeout: boolean): boolean {
  if (isNetworkOrTimeout) return true;
  if (status === undefined) return true;
  if (status >= 500) return true;
  if (status === 408 || status === 429) return true;
  return false;
}

function getDelayWithJitter(delayMs: number, jitterFraction: number): number {
  const jitter = (Math.random() * 2 - 1) * jitterFraction;
  return Math.round(delayMs * (1 + jitter));
}

function recordFailure(agentId: string): void {
  const nowMs = now();
  let entry = circuitByAgentId.get(agentId);
  if (!entry) {
    circuitByAgentId.set(agentId, {
      state: "closed",
      failures: 1,
      lastFailureAt: nowMs,
      openedAt: 0,
    });
    return;
  }
  if (entry.state === "half_open") {
    circuitByAgentId.set(agentId, {
      state: "open",
      failures: entry.failures,
      lastFailureAt: nowMs,
      openedAt: nowMs,
    });
    return;
  }
  const inWindow = nowMs - entry.lastFailureAt <= CIRCUIT_FAILURE_WINDOW_MS;
  const failures = inWindow ? entry.failures + 1 : 1;
  const open = failures >= CIRCUIT_FAILURE_THRESHOLD;
  circuitByAgentId.set(agentId, {
    state: open ? "open" : "closed",
    failures,
    lastFailureAt: nowMs,
    openedAt: open ? nowMs : entry.openedAt,
  });
}

function recordSuccess(agentId: string): void {
  const entry = circuitByAgentId.get(agentId);
  if (!entry) return;
  circuitByAgentId.set(agentId, {
    state: "closed",
    failures: 0,
    lastFailureAt: 0,
    openedAt: 0,
  });
}

/**
 * For test isolation only. Resets circuit state for one agent or all agents.
 */
export function resetWebhookCircuitForTests(agentId?: string): void {
  if (agentId !== undefined) {
    circuitByAgentId.delete(agentId);
  } else {
    circuitByAgentId.clear();
  }
}

function shouldAllowDelivery(agentId: string): boolean {
  const entry = circuitByAgentId.get(agentId);
  if (!entry) return true;
  if (entry.state === "closed") return true;
  if (entry.state === "half_open") return true;
  if (entry.state === "open") {
    const elapsed = now() - entry.openedAt;
    if (elapsed >= CIRCUIT_COOLDOWN_MS) {
      circuitByAgentId.set(agentId, {
        ...entry,
        state: "half_open",
      });
      return true;
    }
    return false;
  }
  return true;
}

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
  retryConfig: WebhookRetryConfig = DEFAULT_RETRY_CONFIG,
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

  if (!shouldAllowDelivery(agentId)) {
    logger.info({ agentId, issueId }, "webhook delivery skipped; circuit open");
    return;
  }

  const entry = circuitByAgentId.get(agentId);
  const isHalfOpen = entry?.state === "half_open";
  const maxAttempts = isHalfOpen ? 1 : retryConfig.delaysMs.length + 1;

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
  let lastStatus: number | undefined;
  let lastWasNetworkOrTimeout = false;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: rawBody,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      lastStatus = response.status;
      lastWasNetworkOrTimeout = false;
      if (response.ok) {
        recordSuccess(agentId);
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
      recordFailure(agentId);
      if (!isRetriable(response.status, false)) {
        throw lastError;
      }
      if (attempt < maxAttempts - 1) {
        const delayMs = retryConfig.delaysMs[attempt] ?? retryConfig.delaysMs[retryConfig.delaysMs.length - 1]!;
        const jittered = getDelayWithJitter(delayMs, retryConfig.jitterFraction);
        logger.warn(
          { agentId, issueId, attempt: attempt + 1, status: response.status },
          "webhook delivery failed; retrying after delay",
        );
        await new Promise((r) => setTimeout(r, jittered));
      }
    } catch (err) {
      lastError = err;
      lastWasNetworkOrTimeout = lastStatus === undefined;
      recordFailure(agentId);
      if (attempt < maxAttempts - 1 && isRetriable(lastStatus, lastWasNetworkOrTimeout)) {
        const delayMs = retryConfig.delaysMs[attempt] ?? retryConfig.delaysMs[retryConfig.delaysMs.length - 1]!;
        const jittered = getDelayWithJitter(delayMs, retryConfig.jitterFraction);
        logger.warn(
          { agentId, issueId, attempt: attempt + 1, err },
          "webhook delivery failed; retrying after delay",
        );
        await new Promise((r) => setTimeout(r, jittered));
      } else {
        throw lastError;
      }
    }
  }
  throw lastError;
}
