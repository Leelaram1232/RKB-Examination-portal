

# Fix Recalculate Result & Calculate Rankings - Route to External Backend

## Problem

The admin pages call `recalculate-result` and `calculate-rankings` using `supabase.functions.invoke`, which sends requests to Lovable Cloud. These functions are deployed on your external Supabase instance, so the calls fail with "Failed to send a request to the Edge Function."

## Solution

Switch both admin pages to use `invokeExternalFunction` from `src/lib/externalSupabase.ts`, which sends requests directly to your external Supabase backend.

## Changes

### 1. `src/pages/admin/ExamResults.tsx`

- Replace `supabase.functions.invoke('recalculate-result', ...)` with `invokeExternalFunction('recalculate-result', { session_id })`
- Replace `supabase.functions.invoke('calculate-rankings', ...)` with `invokeExternalFunction('calculate-rankings', { exam_id })`
- Add import for `invokeExternalFunction`

### 2. `src/pages/admin/StudentAnswerReview.tsx`

- Replace `supabase.functions.invoke('recalculate-result', ...)` with `invokeExternalFunction('recalculate-result', { session_id })`
- Add import for `invokeExternalFunction`

### No edge function code changes

The functions themselves are already deployed on your external Supabase. This is purely a frontend routing fix -- same pattern as the `create-cashfree-order` fix.

## Important Reminder

After applying this fix, make sure the `createClient` rename fix (aliasing to `createSupabaseClient`) has been applied to both functions in your external Supabase dashboard. Otherwise you will still see the "Identifier 'createClient' has already been declared" boot error.

