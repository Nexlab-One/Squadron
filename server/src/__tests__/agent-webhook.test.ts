import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import {
  deliverWorkAvailable,
  isAllowedWebhookUrl,
  signWebhookPayload,
  WORKABLE_STATUSES_FOR_WEBHOOK,
  WEBHOOK_VERSION,
} from "../services/agent-webhook.js";

describe("agent-webhook", () => {
  describe("signWebhookPayload", () => {
    it("produces hex-encoded HMAC-SHA256 of body", () => {
      const body = '{"event":"work_available","issueId":"i1"}';
      const secret = "my-secret";
      const sig = signWebhookPayload(body, secret);
      expect(sig).toMatch(/^[0-9a-f]{64}$/);
      expect(signWebhookPayload(body, secret)).toBe(sig);
      expect(signWebhookPayload(body, "other")).not.toBe(sig);
      expect(signWebhookPayload(body + "x", secret)).not.toBe(sig);
    });
  });

  describe("isAllowedWebhookUrl", () => {
    it("accepts https URLs", () => {
      expect(isAllowedWebhookUrl("https://example.com/webhook")).toBe(true);
      expect(isAllowedWebhookUrl("https://localhost:9999/cb")).toBe(true);
    });

    it("rejects invalid URLs", () => {
      expect(isAllowedWebhookUrl("not-a-url")).toBe(false);
      expect(isAllowedWebhookUrl("")).toBe(false);
    });

    it("rejects non-http(s) protocols", () => {
      expect(isAllowedWebhookUrl("file:///tmp/x")).toBe(false);
    });

    it("in production rejects http", () => {
      const orig = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = "production";
        expect(isAllowedWebhookUrl("http://example.com/webhook")).toBe(false);
        expect(isAllowedWebhookUrl("https://example.com/webhook")).toBe(true);
      } finally {
        process.env.NODE_ENV = orig;
      }
    });
  });

  describe("deliverWorkAvailable", () => {
    const agentId = "agent-1";
    const companyId = "company-1";
    const issueId = "issue-1";

    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("returns without sending when agent has no webhookUrl", async () => {
      const db = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () =>
                Promise.resolve([
                  {
                    id: agentId,
                    companyId,
                    runtimeConfig: {},
                  },
                ]),
            }),
          }),
        }),
      } as unknown as Db;

      await deliverWorkAvailable(agentId, companyId, issueId, db);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("returns without sending when agent has webhookUrl but no webhookSecret", async () => {
      const db = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () =>
                Promise.resolve([
                  {
                    id: agentId,
                    companyId,
                    runtimeConfig: { webhookUrl: "https://example.com/hook" },
                  },
                ]),
            }),
          }),
        }),
      } as unknown as Db;

      await deliverWorkAvailable(agentId, companyId, issueId, db);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("sends POST with correct payload and signature when webhookUrl and secret set", async () => {
      const webhookUrl = "https://example.com/hook";
      const secret = "my-secret";
      (vi.mocked(fetch) as any).mockResolvedValue({ ok: true });

      const db = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () =>
                Promise.resolve([
                  {
                    id: agentId,
                    companyId,
                    runtimeConfig: { webhookUrl, webhookSecret: secret },
                  },
                ]),
            }),
          }),
        }),
      } as unknown as Db;

      await deliverWorkAvailable(agentId, companyId, issueId, db);

      expect(fetch).toHaveBeenCalledTimes(1);
      const [url, opts] = (fetch as any).mock.calls[0];
      expect(url).toBe(webhookUrl);
      expect(opts.method).toBe("POST");
      expect(opts.headers["Content-Type"]).toBe("application/json");
      expect(opts.headers["X-Paperclip-Webhook-Version"]).toBe(String(WEBHOOK_VERSION));
      const body = opts.body;
      const payload = JSON.parse(body);
      expect(payload).toMatchObject({
        event: "work_available",
        issueId,
        companyId,
        agentId,
        version: WEBHOOK_VERSION,
      });
      expect(typeof payload.timestamp).toBe("string");
      const expectedSig = signWebhookPayload(body, secret);
      expect(opts.headers["X-Paperclip-Signature"]).toBe(expectedSig);
    });
  });

  describe("WORKABLE_STATUSES_FOR_WEBHOOK", () => {
    it("includes todo and in_progress", () => {
      expect(WORKABLE_STATUSES_FOR_WEBHOOK).toContain("todo");
      expect(WORKABLE_STATUSES_FOR_WEBHOOK).toContain("in_progress");
    });
  });
});
