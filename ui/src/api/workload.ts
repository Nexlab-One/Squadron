import type { WorkloadResponse } from "@paperclipai/shared";
import { api } from "./client";

export const workloadApi = {
  get: (companyId: string) =>
    api.get<WorkloadResponse>(`/companies/${companyId}/workload`),
};
