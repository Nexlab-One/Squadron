import path from "node:path";
import {
  expandHomePrefix,
  resolveDefaultConfigPath,
  resolveDefaultContextPath,
  resolvePaperclipInstanceId,
} from "./home.js";

export interface DataDirOptionLike {
  dataDir?: string;
  config?: string;
  context?: string;
  instance?: string;
}

export interface DataDirCommandSupport {
  hasConfigOption?: boolean;
  hasContextOption?: boolean;
}

export function applyDataDirOverride(
  options: DataDirOptionLike,
  support: DataDirCommandSupport = {},
): string | null {
  const rawDataDir = options.dataDir?.trim();
  if (!rawDataDir) return null;

  const resolvedDataDir = path.resolve(expandHomePrefix(rawDataDir));
  process.env.SQUADRON_HOME = resolvedDataDir;
  process.env.PAPERCLIP_HOME = resolvedDataDir;

  if (support.hasConfigOption) {
    const hasConfigOverride = Boolean(options.config?.trim()) || Boolean(process.env.SQUADRON_CONFIG ?? process.env.PAPERCLIP_CONFIG);
    if (!hasConfigOverride) {
      const instanceId = resolvePaperclipInstanceId(options.instance);
      process.env.SQUADRON_INSTANCE_ID = instanceId;
      process.env.PAPERCLIP_INSTANCE_ID = instanceId;
      const configPath = resolveDefaultConfigPath(instanceId);
      process.env.SQUADRON_CONFIG = configPath;
      process.env.PAPERCLIP_CONFIG = configPath;
    }
  }

  if (support.hasContextOption) {
    const hasContextOverride = Boolean(options.context?.trim()) || Boolean(process.env.SQUADRON_CONTEXT ?? process.env.PAPERCLIP_CONTEXT);
    if (!hasContextOverride) {
      const contextPath = resolveDefaultContextPath();
      process.env.SQUADRON_CONTEXT = contextPath;
      process.env.PAPERCLIP_CONTEXT = contextPath;
    }
  }

  return resolvedDataDir;
}
