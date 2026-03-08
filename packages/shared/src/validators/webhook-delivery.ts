import { z } from "zod";

export const webhookDeliveryRetrySchema = z.object({
  issueId: z.string().uuid(),
  agentId: z.string().uuid(),
  eventType: z.enum(["work_available"]).optional(),
});

export type WebhookDeliveryRetry = z.infer<typeof webhookDeliveryRetrySchema>;
