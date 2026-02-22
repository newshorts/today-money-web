import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(256),
});

export const loginSchema = registerSchema;

export const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

export const patchMeSchema = z.object({
  timezone: z.string().min(1).max(100),
});

export const exchangePublicTokenSchema = z.object({
  publicToken: z.string().min(1),
  metadata: z
    .object({
      institutionId: z.string().optional(),
      institutionName: z.string().optional(),
    })
    .optional(),
});

export const putBudgetProfileSchema = z.object({
  incomeMonthlyCents: z.number().int(),
  fixedMonthlyCents: z.number().int(),
  sourceIncome: z.enum(["PLAID_SUGGESTED", "USER_OVERRIDDEN"]),
  sourceFixed: z.enum(["PLAID_SUGGESTED", "USER_OVERRIDDEN"]),
});

export const manualTransactionSchema = z.object({
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1).max(200),
  amountCents: z.number().int(),
  currency: z.literal("USD"),
});

export const patchTransactionSchema = z.object({
  budgetImpact: z
    .enum([
      "VARIABLE",
      "FIXED_EXCLUDED",
      "TRANSFER_EXCLUDED",
      "INCOME_EXCLUDED",
      "USER_EXCLUDED",
    ])
    .optional(),
  userOverrideImpact: z.boolean().optional(),
  isHidden: z.boolean().optional(),
  userNote: z.string().max(400).optional(),
});

export const monthQuerySchema = z.object({
  year: z.coerce.number().int().min(1970).max(9999),
  month: z.coerce.number().int().min(1).max(12),
  includeHidden: z
    .string()
    .optional()
    .transform((value) => value === "true"),
});
