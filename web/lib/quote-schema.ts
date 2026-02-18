import { z } from 'zod'

export const quoteProviderSchema = z.object({
  name: z.string(),
  phone: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string(),
  stateCode: z.string(),
  postalCode: z.string().nullable().optional(),
  locationLink: z.string().nullable().optional(),
  placeId: z.string(),
  googleId: z.string().nullable().optional(),
})

export const quoteRequestSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().max(100).default(''),
  email: z.string().email('Please enter a valid email'),
  phone: z.string().max(30).default(''),
  address: z.string().max(500).default(''),
  notes: z.string().max(1000).default(''),
  honeypot: z.string().max(0),
  loadedAt: z.number(),
  provider: quoteProviderSchema,
  pageUrl: z.string().default(''),
})

export type QuoteRequest = z.infer<typeof quoteRequestSchema>
export type QuoteProviderInfo = z.infer<typeof quoteProviderSchema>
