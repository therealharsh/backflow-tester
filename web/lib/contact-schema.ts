import { z } from 'zod'

export const contactFormSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().max(100).default(''),
  email: z.string().email('Please enter a valid email'),
  phone: z.string().max(30).default(''),
  message: z.string().min(1, 'Message is required').max(2000),
  honeypot: z.string().max(0),
  loadedAt: z.number(),
})

export type ContactFormData = z.infer<typeof contactFormSchema>
