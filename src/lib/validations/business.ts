import { z } from "zod";

export const createBusinessSchema = z.object({
  ownerId: z.string().uuid({ message: "Must be a valid Supabase user UUID — see the help text below the field." }),
  name: z.string().min(1).max(200),
  businessType: z.string().min(1).max(100),
  phoneNumber: z.string().max(50).optional(),
  defaultLanguage: z.enum(["en", "hi"]).default("en"),
  timezone: z.string().min(1).default("Asia/Kolkata"),
});

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;