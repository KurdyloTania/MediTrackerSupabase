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
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(6, 'Password must be at least 6 characters'),
});

export const signUpSchema = z
  .object({
    fullName: z
      .string()
      .min(1, 'Full name is required')
      .min(2, 'Name must be at least 2 characters')
      .max(50, 'Name must be under 50 characters'),
    email: z
      .string()
      .min(1, 'Email is required')
      .email('Please enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Must contain at least one number'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
});

export type SignInFormData = z.infer<typeof signInSchema>;
export type SignUpFormData = z.infer<typeof signUpSchema>;
export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong';

export function getPasswordStrength(password: string): {
  strength: PasswordStrength;
  score: number;
  label: string;
  color: string;
} {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { strength: 'weak', score, label: 'Weak', color: '#EF4444' };
  if (score === 2) return { strength: 'fair', score, label: 'Fair', color: '#F97316' };
  if (score === 3) return { strength: 'good', score, label: 'Good', color: '#EAB308' };
  return { strength: 'strong', score, label: 'Strong', color: '#22C55E' };
}

export function getAuthErrorMessage(error: any): string {
  const message = error?.message || error?.msg || String(error);

  if (message.includes('Invalid login credentials')) {
    return 'Incorrect email or password. Please try again.';
  }
  if (message.includes('Email not confirmed')) {
    return 'Please check your email and confirm your account first.';
  }
  if (message.includes('User already registered') || message.includes('already been registered')) {
    return 'An account with this email already exists. Try signing in.';
  }
  if (message.includes('Password should be at least')) {
    return 'Password must be at least 6 characters long.';
  }
  if (message.includes('Unable to validate email address')) {
    return 'Please enter a valid email address.';
  }
  if (message.includes('For security purposes') || message.includes('rate limit')) {
    return 'Too many attempts. Please wait a moment before trying again.';
  }
  if (message.includes('Network') || message.includes('fetch')) {
    return 'No internet connection. Please check your network and try again.';
  }
  if (message.includes('Email rate limit exceeded')) {
    return 'Too many emails sent. Please wait before requesting another.';
  }

  return 'Something went wrong. Please try again.';
}


















