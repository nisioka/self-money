import { z } from 'zod';

export const saveTotpSecretSchema = z.object({
  secret: z
    .string()
    .min(16, 'TOTP secret must be at least 16 characters')
    .max(32, 'TOTP secret must be at most 32 characters')
    .regex(/^[A-Z2-7]+$/, 'TOTP secret must be valid Base32'),
});

export type SaveTotpSecretInput = z.infer<typeof saveTotpSecretSchema>;
