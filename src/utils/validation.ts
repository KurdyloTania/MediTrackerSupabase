import { z } from 'zod';

const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

export const medicationSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  dosage: z.string().optional(),
  frequency: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('daily'),
      time: z.string().regex(timeRegex, 'Invalid time format'),
    }),
    z.object({
      type: z.literal('interval'),
      hours: z.number().min(1).max(72),
    }),
    z.object({
      type: z.literal('custom'),
      weekdays: z.array(z.number().min(0).max(6)).min(1, 'Select at least one day'),
      time: z.string().regex(timeRegex, 'Invalid time format'),
    }),
  ]),
  start_date: z.date(),
  end_date: z.date().optional().nullable(),
  notes: z.string().optional(),
  reminder_enabled: z.boolean().default(true),
});

export type MedicationFormData = z.infer<typeof medicationSchema>;

export const signInSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const signUpSchema = signInSchema.extend({
  fullName: z.string().min(1, 'Full name is required'),
});