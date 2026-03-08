import type { StandupReport } from "@paperclipai/shared";
import { api } from "./client";

export const standupApi = {
  get: (companyId: string) =>
    api.get<StandupReport>(`/companies/${companyId}/standup`),
};
