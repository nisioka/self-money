import { z } from 'zod';

export const pushSubscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const unsubscribeSchema = z.object({
  endpoint: z.url(),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
export type UnsubscribeInput = z.infer<typeof unsubscribeSchema>;
