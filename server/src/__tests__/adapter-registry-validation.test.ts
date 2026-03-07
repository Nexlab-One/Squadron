import { createAgentSchema, updateAgentSchema } from "@paperclipai/shared/validators/agent";
import { describe, expect, it } from "vitest";
import {
  assertAdapterTypeAllowed,
  findServerAdapter,
  getAllowedAdapterTypes,
  validateAdapterConfig,
} from "../adapters/registry.js";
import { validateProcessConfig } from "../adapters/process/validate.js";

describe("adapter registry", () => {
  it("getAllowedAdapterTypes returns non-empty list including process and http", () => {
    const types = getAllowedAdapterTypes();
    expect(Array.isArray(types)).toBe(true);
    expect(types.length).toBeGreaterThan(0);
    expect(types).toContain("process");
    expect(types).toContain("http");
  });

  it("findServerAdapter returns null for unknown type", () => {
    expect(findServerAdapter("unknown_adapter_xyz")).toBeNull();
  });

  it("assertAdapterTypeAllowed throws for null/empty/unknown type", () => {
    expect(() => assertAdapterTypeAllowed(null)).toThrow(/adapterType is required/);
    expect(() => assertAdapterTypeAllowed("")).toThrow(/adapterType is required/);
    expect(() => assertAdapterTypeAllowed("   ")).toThrow(/adapterType is required/);
    expect(() => assertAdapterTypeAllowed("unknown_adapter_xyz")).toThrow(/Unknown adapter type/);
  });

  it("assertAdapterTypeAllowed does not throw for known type", () => {
    expect(() => assertAdapterTypeAllowed("process")).not.toThrow();
    expect(() => assertAdapterTypeAllowed("claude_local")).not.toThrow();
  });

  it("validateAdapterConfig throws for unknown adapter type", async () => {
    await expect(
      validateAdapterConfig("unknown_adapter_xyz", {}),
    ).rejects.toThrow(/Unknown adapter type/);
  });

  it("validateAdapterConfig resolves for process adapter with valid config", async () => {
    await expect(
      validateAdapterConfig("process", { command: "node", args: ["--version"] }),
    ).resolves.toBeUndefined();
  });
});

describe("process adapter validateConfig", () => {
  it("rejects missing command", () => {
    expect(() => validateProcessConfig({}, undefined)).toThrow(/adapterConfig\.command/);
    expect(() => validateProcessConfig({ command: "" }, undefined)).toThrow(/adapterConfig\.command/);
    expect(() => validateProcessConfig({ command: "   " }, undefined)).toThrow(/adapterConfig\.command/);
  });

  it("accepts valid command", () => {
    expect(() => validateProcessConfig({ command: "node" }, undefined)).not.toThrow();
    expect(() =>
      validateProcessConfig({ command: "node", args: ["--version"], timeoutSec: 60 }, undefined),
    ).not.toThrow();
  });

  it("accepts config with timeout and grace within caps", () => {
    expect(() =>
      validateProcessConfig(
        { command: "node", timeoutSec: 900, graceSec: 15 },
        undefined,
      ),
    ).not.toThrow();
  });
});

describe("shared agent validators (adapterType string)", () => {
  it("createAgentSchema accepts any non-empty string for adapterType", () => {
    const out = createAgentSchema.parse({ name: "Test", adapterType: "custom_adapter" });
    expect(out.adapterType).toBe("custom_adapter");
    const out2 = createAgentSchema.parse({ name: "Test", adapterType: "process" });
    expect(out2.adapterType).toBe("process");
  });

  it("updateAgentSchema accepts optional adapterType as non-empty string", () => {
    const out = updateAgentSchema.parse({ adapterType: "custom_adapter" });
    expect(out.adapterType).toBe("custom_adapter");
  });
});
