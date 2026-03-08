import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import {
  deliverWorkAvailable,
  isAllowedWebhookUrl,
  resetWebhookCircuitForTests,
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

    function mockDb(runtimeConfig: Record<string, unknown>): Db {
      return {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () =>
                Promise.resolve([
                  {
                    id: agentId,
                    companyId,
                    runtimeConfig,
                  },
                ]),
            }),
          }),
        }),
      } as unknown as Db;
    }

    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
      resetWebhookCircuitForTests();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("returns without sending when agent has no webhookUrl", async () => {
      await deliverWorkAvailable(agentId, companyId, issueId, mockDb({}));
      expect(fetch).not.toHaveBeenCalled();
    });

    it("returns without sending when agent has webhookUrl but no webhookSecret", async () => {
      await deliverWorkAvailable(agentId, companyId, issueId, mockDb({ webhookUrl: "https://example.com/hook" }));
      expect(fetch).not.toHaveBeenCalled();
    });

    it("sends POST with correct payload and signature when webhookUrl and secret set", async () => {
      const webhookUrl = "https://example.com/hook";
      const secret = "my-secret";
      (vi.mocked(fetch) as any).mockResolvedValue({ ok: true });

      await deliverWorkAvailable(agentId, companyId, issueId, mockDb({ webhookUrl, webhookSecret: secret }));

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

    describe("retry policy", () => {
      it("retries on 5xx up to max attempts", async () => {
        vi.useFakeTimers();
        (vi.mocked(fetch) as any).mockResolvedValue({ ok: false, status: 500 });
        const db = mockDb({ webhookUrl: "https://example.com/hook", webhookSecret: "secret" });

        let err: unknown;
        const p = deliverWorkAvailable(agentId, companyId, issueId, db).catch((e) => {
          err = e;
        });
        await vi.advanceTimersByTimeAsync(10000);
        await p;
        vi.useRealTimers();

        expect(err).toBeDefined();
        expect((err as Error).message).toBe("HTTP 500");
        expect(fetch).toHaveBeenCalledTimes(4);
      });

      it("does not retry on 4xx (e.g. 400)", async () => {
        (vi.mocked(fetch) as any).mockResolvedValue({ ok: false, status: 400 });
        const db = mockDb({ webhookUrl: "https://example.com/hook", webhookSecret: "secret" });

        await expect(deliverWorkAvailable(agentId, companyId, issueId, db)).rejects.toThrow("HTTP 400");
        expect(fetch).toHaveBeenCalledTimes(1);
      });

      it("succeeds on second attempt and stops retrying", async () => {
        vi.useFakeTimers();
        (vi.mocked(fetch) as any)
          .mockResolvedValueOnce({ ok: false, status: 503 })
          .mockResolvedValueOnce({ ok: true });
        const db = mockDb({ webhookUrl: "https://example.com/hook", webhookSecret: "secret" });

        const p = deliverWorkAvailable(agentId, companyId, issueId, db);
        await vi.advanceTimersByTimeAsync(2000);
        await p;
        vi.useRealTimers();

        expect(fetch).toHaveBeenCalledTimes(2);
      });
    });

    describe("circuit breaker", () => {
      const circuitAgentId = "circuit-agent-1";

      function mockDbCircuit(config: Record<string, unknown>): Db {
        return {
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () =>
                  Promise.resolve([
                    {
                      id: circuitAgentId,
                      companyId: "company-1",
                      runtimeConfig: config,
                    },
                  ]),
              }),
            }),
          }),
        } as unknown as Db;
      }

      it("skips delivery when circuit is open", async () => {
        resetWebhookCircuitForTests();
        vi.useFakeTimers();
        (vi.mocked(fetch) as any).mockResolvedValue({ ok: false, status: 500 });
        const db = mockDbCircuit({
          webhookUrl: "https://example.com/hook",
          webhookSecret: "secret",
        });

        let err1: unknown;
        const p1 = deliverWorkAvailable(circuitAgentId, "company-1", "issue-1", db).catch((e) => {
          err1 = e;
        });
        await vi.advanceTimersByTimeAsync(10000);
        await p1;
        expect(err1).toBeDefined();
        expect((err1 as Error).message).toBe("HTTP 500");
        expect(fetch).toHaveBeenCalledTimes(4);

        let err2: unknown;
        const p2 = deliverWorkAvailable(circuitAgentId, "company-1", "issue-2", db).catch((e) => {
          err2 = e;
        });
        await vi.advanceTimersByTimeAsync(10000);
        await p2;
        expect(err2).toBeDefined();
        expect(fetch).toHaveBeenCalledTimes(8);

        await deliverWorkAvailable(circuitAgentId, "company-1", "issue-3", db);
        expect(fetch).toHaveBeenCalledTimes(8);
        vi.useRealTimers();
      });

      it("attempts delivery again after reset", async () => {
        resetWebhookCircuitForTests();
        vi.useFakeTimers();
        (vi.mocked(fetch) as any).mockResolvedValue({ ok: false, status: 500 });
        const db = mockDbCircuit({
          webhookUrl: "https://example.com/hook",
          webhookSecret: "secret",
        });

        let err1: unknown;
        const p1 = deliverWorkAvailable(circuitAgentId, "company-1", "issue-1", db).catch((e) => {
          err1 = e;
        });
        await vi.advanceTimersByTimeAsync(10000);
        await p1;
        let err2: unknown;
        const p2 = deliverWorkAvailable(circuitAgentId, "company-1", "issue-2", db).catch((e) => {
          err2 = e;
        });
        await vi.advanceTimersByTimeAsync(10000);
        await p2;
        expect(err1).toBeDefined();
        expect(err2).toBeDefined();
        expect(fetch).toHaveBeenCalledTimes(8);
        resetWebhookCircuitForTests();
        vi.useRealTimers();
        (vi.mocked(fetch) as any).mockResolvedValue({ ok: true });
        await deliverWorkAvailable(circuitAgentId, "company-1", "issue-3", db);
        expect(fetch).toHaveBeenCalledTimes(9);
      });

      it("allows one probe after cooldown then closes on success", async () => {
        resetWebhookCircuitForTests();
        vi.useFakeTimers();
        (vi.mocked(fetch) as any).mockResolvedValue({ ok: false, status: 500 });
        const db = mockDbCircuit({
          webhookUrl: "https://example.com/hook",
          webhookSecret: "secret",
        });

        let err1: unknown;
        const p1 = deliverWorkAvailable(circuitAgentId, "company-1", "issue-1", db).catch((e) => {
          err1 = e;
        });
        await vi.advanceTimersByTimeAsync(10000);
        await p1;
        let err2: unknown;
        const p2 = deliverWorkAvailable(circuitAgentId, "company-1", "issue-2", db).catch((e) => {
          err2 = e;
        });
        await vi.advanceTimersByTimeAsync(10000);
        await p2;
        expect(err1).toBeDefined();
        expect(err2).toBeDefined();
        expect(fetch).toHaveBeenCalledTimes(8);

        await deliverWorkAvailable(circuitAgentId, "company-1", "issue-3", db);
        expect(fetch).toHaveBeenCalledTimes(8);

        vi.advanceTimersByTime(61000);
        (vi.mocked(fetch) as any).mockResolvedValue({ ok: true });
        await deliverWorkAvailable(circuitAgentId, "company-1", "issue-4", db);
        expect(fetch).toHaveBeenCalledTimes(9);
        vi.useRealTimers();
      });
    });
  });

  describe("WORKABLE_STATUSES_FOR_WEBHOOK", () => {
    it("includes todo and in_progress", () => {
      expect(WORKABLE_STATUSES_FOR_WEBHOOK).toContain("todo");
      expect(WORKABLE_STATUSES_FOR_WEBHOOK).toContain("in_progress");
    });
  });
});
