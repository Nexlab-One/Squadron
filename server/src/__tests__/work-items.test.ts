import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentRoutes } from "../routes/agents.js";
import { errorHandler } from "../middleware/error-handler.js";

const companyA = "550e8400-e29b-41d4-a716-446655440000";
const agentA = "880e8400-e29b-41d4-a716-446655440003";
const agentB = "990e8400-e29b-41d4-a716-446655440004";

const mockAgentA = {
  id: agentA,
  companyId: companyA,
  name: "Agent A",
  urlKey: "agent-a",
  role: "general",
  title: null,
  icon: null,
  status: "idle",
  reportsTo: null,
  capabilities: null,
  adapterType: "process",
  adapterConfig: {},
  runtimeConfig: {},
  budgetMonthlyCents: 0,
  spentMonthlyCents: 0,
  permissions: {},
  lastHeartbeatAt: null,
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockAgentB = {
  ...mockAgentA,
  id: agentB,
  name: "Agent B",
  urlKey: "agent-b",
};

const mockTasks = [
  {
    id: "issue-1",
    companyId: companyA,
    title: "Task one",
    status: "todo",
    assigneeAgentId: agentA,
    assigneeUserId: null,
  },
];

const getByIdMock = vi.fn();
const listIssuesMock = vi.fn();

vi.mock("../services/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/index.js")>();
  return {
    ...actual,
    agentService: () => ({ getById: getByIdMock }),
    issueService: () => ({ list: listIssuesMock }),
  };
});

function createApp(actor: {
  type: "board" | "agent";
  userId?: string;
  agentId?: string;
  companyId?: string;
}) {
  const app = express();
  app.use((req, _res, next) => {
    req.actor =
      actor.type === "board"
        ? {
            type: "board",
            userId: actor.userId ?? "board",
            source: "local_implicit" as const,
          }
        : {
            type: "agent",
            agentId: actor.agentId ?? agentA,
            companyId: actor.companyId ?? companyA,
            source: "agent_key" as const,
          };
    next();
  });
  app.use(agentRoutes({} as Parameters<typeof agentRoutes>[0]));
  app.use(errorHandler);
  return app;
}

describe("GET /agents/:id/work-items", () => {
  beforeEach(() => {
    getByIdMock.mockReset();
    listIssuesMock.mockReset();
  });

  it("returns 200 with tasks when board requests work-items for an agent", async () => {
    getByIdMock.mockResolvedValue(mockAgentA);
    listIssuesMock.mockResolvedValue(mockTasks);

    const app = createApp({ type: "board" });
    const res = await request(app).get(`/agents/${agentA}/work-items`);

    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.tasks[0].id).toBe("issue-1");
    expect(res.body.tasks[0].assigneeAgentId).toBe(agentA);
    expect(listIssuesMock).toHaveBeenCalledWith(companyA, {
      assigneeAgentId: agentA,
      status: "todo,in_progress",
    });
  });

  it("returns 200 when agent requests own work-items", async () => {
    getByIdMock.mockResolvedValue(mockAgentA);
    listIssuesMock.mockResolvedValue(mockTasks);

    const app = createApp({ type: "agent", agentId: agentA, companyId: companyA });
    const res = await request(app).get(`/agents/${agentA}/work-items`);

    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(1);
  });

  it("returns 403 when agent requests another agent work-items", async () => {
    getByIdMock.mockResolvedValue(mockAgentB);

    const app = createApp({ type: "agent", agentId: agentA, companyId: companyA });
    const res = await request(app).get(`/agents/${agentB}/work-items`);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("own work-items");
    expect(listIssuesMock).not.toHaveBeenCalled();
  });

  it("returns 404 when agent does not exist", async () => {
    getByIdMock.mockResolvedValue(null);

    const app = createApp({ type: "board" });
    const res = await request(app).get(`/agents/${agentA}/work-items`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Agent not found");
  });
});
