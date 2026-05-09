import { supabase } from '../integrations/supabase/client';

export { supabase };

/**
 * Wrapper to invoke a Supabase Edge Function.
 * This was previously used for cross-project invocations but now 
 * unified to use the primary Supabase project.
 */
export async function invokeExternalFunction<T = any>(functionName: string, body: any) {
  console.log(`[invokeExternalFunction] Invoking ${functionName}...`);
  return await supabase.functions.invoke<T>(functionName, {
    body: body
  });
}
