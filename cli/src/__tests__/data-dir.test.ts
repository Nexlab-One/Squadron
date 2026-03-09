import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyDataDirOverride } from "../config/data-dir.js";

const ORIGINAL_ENV = { ...process.env };

describe("applyDataDirOverride", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.SQUADRON_HOME;
    delete process.env.PAPERCLIP_HOME;
    delete process.env.PAPERCLIP_CONFIG;
    delete process.env.PAPERCLIP_CONTEXT;
    delete process.env.PAPERCLIP_INSTANCE_ID;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("sets SQUADRON_HOME and PAPERCLIP_HOME and isolated default config/context paths", () => {
    const home = applyDataDirOverride({
      dataDir: "~/paperclip-data",
      config: undefined,
      context: undefined,
    }, { hasConfigOption: true, hasContextOption: true });

    const expectedHome = path.resolve(os.homedir(), "paperclip-data");
    const expectedConfig = path.resolve(expectedHome, "instances", "default", "config.json");
    const expectedContext = path.resolve(expectedHome, "context.json");
    expect(home).toBe(expectedHome);
    expect(process.env.SQUADRON_HOME).toBe(expectedHome);
    expect(process.env.PAPERCLIP_HOME).toBe(expectedHome);
    expect(process.env.SQUADRON_CONFIG).toBe(expectedConfig);
    expect(process.env.PAPERCLIP_CONFIG).toBe(expectedConfig);
    expect(process.env.SQUADRON_CONTEXT).toBe(expectedContext);
    expect(process.env.PAPERCLIP_CONTEXT).toBe(expectedContext);
    expect(process.env.SQUADRON_INSTANCE_ID).toBe("default");
    expect(process.env.PAPERCLIP_INSTANCE_ID).toBe("default");
  });

  it("uses the provided instance id when deriving default config path", () => {
    const home = applyDataDirOverride({
      dataDir: "/tmp/paperclip-alt",
      instance: "dev_1",
      config: undefined,
      context: undefined,
    }, { hasConfigOption: true, hasContextOption: true });

    const expectedConfig = path.resolve("/tmp/paperclip-alt", "instances", "dev_1", "config.json");
    expect(home).toBe(path.resolve("/tmp/paperclip-alt"));
    expect(process.env.SQUADRON_INSTANCE_ID).toBe("dev_1");
    expect(process.env.PAPERCLIP_INSTANCE_ID).toBe("dev_1");
    expect(process.env.SQUADRON_CONFIG).toBe(expectedConfig);
    expect(process.env.PAPERCLIP_CONFIG).toBe(expectedConfig);
  });

  it("does not override explicit config/context settings", () => {
    process.env.PAPERCLIP_CONFIG = "/env/config.json";
    process.env.PAPERCLIP_CONTEXT = "/env/context.json";

    applyDataDirOverride({
      dataDir: "/tmp/paperclip-alt",
      config: "/flag/config.json",
      context: "/flag/context.json",
    }, { hasConfigOption: true, hasContextOption: true });

    expect(process.env.PAPERCLIP_CONFIG).toBe("/env/config.json");
    expect(process.env.PAPERCLIP_CONTEXT).toBe("/env/context.json");
  });

  it("only applies defaults for options supported by the command", () => {
    applyDataDirOverride(
      {
        dataDir: "/tmp/paperclip-alt",
      },
      { hasConfigOption: false, hasContextOption: false },
    );

    expect(process.env.SQUADRON_HOME).toBe(path.resolve("/tmp/paperclip-alt"));
    expect(process.env.PAPERCLIP_HOME).toBe(path.resolve("/tmp/paperclip-alt"));
    expect(process.env.SQUADRON_CONFIG).toBeUndefined();
    expect(process.env.PAPERCLIP_CONFIG).toBeUndefined();
    expect(process.env.SQUADRON_CONTEXT).toBeUndefined();
    expect(process.env.PAPERCLIP_CONTEXT).toBeUndefined();
  });
});
