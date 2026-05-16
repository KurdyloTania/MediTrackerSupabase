# MediTrackerSupabase

MediTrackerSupabase is a production‑ready React Native mobile app for tracking medication intake. It uses Expo SDK 51 and Supabase as the backend, with features like medication scheduling, dose logging, local push notifications, adherence reports, and offline sync.

## Features

- **Authentication**: Sign up / Sign in with email/password, session persisted via SecureStore.
- **Medication Management**: Add, edit, delete medications with flexible frequency (daily, interval, custom weekdays).
- **Dose Logging**: Mark doses as taken or skipped with optimistic updates.
- **Notifications**: Local push reminders 5 minutes before each scheduled dose.
- **Reports**: Daily/weekly adherence charts and data export.
- **Offline Support**: Queue mutations when offline, sync automatically when back online.
- **Real‑time Sync**: Subscriptions for medications and dose logs.
- **Calendar View**: Color‑coded adherence history per medication.

## Tech Stack

- **Expo SDK 51**
- **React Navigation v6** (Stack + Bottom Tabs)
- **React Native Paper** for UI
- **Supabase** for backend and authentication
- **AsyncStorage + SecureStore** for offline queue and session
- **Expo Notifications** for local push
- **React Hook Form + Zod** for form validation
- **date-fns** for date/time handling
- **react-native-calendars** for calendar views
- **react-native-chart-kit** for charts

## Setup Instructions

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. In the SQL Editor, run the entire `supabase/schema.sql` file to create tables, policies, and triggers.
3. Enable **Email/Password** authentication in Authentication → Providers.
4. Get your project URL and anon key from Project Settings → API.

### 2. Deploy the Delete User Edge Function

1. Install the Supabase CLI: `npm install -g supabase`
2. Link your project: `supabase link --project-ref your-project-ref`
3. Deploy the function from `supabase/functions/delete-user/index.ts`:
   ```bash
   supabase functions deploy delete-user