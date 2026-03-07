import { ensureOpenCodeModelConfiguredAndAvailable } from "@paperclipai/adapter-opencode-local/server";

export type OpenCodeValidateOptions = {
  companyId?: string;
  resolveAdapterConfigForRuntime?: (
    companyId: string,
    config: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function validateOpenCodeConfig(
  config: Record<string, unknown>,
  options?: { companyId?: string } & OpenCodeValidateOptions,
): Promise<void> {
  const companyId = options?.companyId;
  const resolve = options?.resolveAdapterConfigForRuntime;
  if (!companyId || !resolve) {
    return;
  }
  const runtimeConfig = await resolve(companyId, config);
  const runtimeEnv = asRecord(runtimeConfig.env) ?? {};
  await ensureOpenCodeModelConfiguredAndAvailable({
    model: runtimeConfig.model,
    command: runtimeConfig.command,
    cwd: runtimeConfig.cwd,
    env: runtimeEnv,
  });
}
