/**
 * External Supabase Client (Unified to Portal DB)
 * 
 * This module provides access to the Supabase project.
 * Unified to use the portal database as requested.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

// Load primary client first so VITE_SUPABASE_* are validated before we build the external client.
import { supabase } from '@/integrations/supabase/client';

<<<<<<< HEAD:src/lib/externalSupabase.ts
/** Same project as `supabase` client — edge functions + RLS data for this app. */
export const EXTERNAL_SUPABASE_URL = ((import.meta.env.VITE_EXTERNAL_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL) as string).replace(/\/rest\/v1\/?$/, '');
export const EXTERNAL_SUPABASE_ANON_KEY = (import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string;
=======
/** Unified project as `supabase` client — edge functions + RLS data for this app. */
export const EXTERNAL_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const EXTERNAL_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
>>>>>>> 2d8c3bd (Unify database architecture and fix auto-approval for successful payments):rkb-exam-portal-main/rkb-exam-portal-main/rkb-exam-portal-main/src/lib/externalSupabase.ts

export const externalSupabase: SupabaseClient<Database> = createClient<Database>(
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

/**
 * Invoke an edge function on the project
 * Uses native fetch to bypass Lovable's fetch wrapper that can block cross-origin calls.
 * 
 * @param functionName - Name of the edge function
 * @param body - Request body to send
 * @param options - Request options
 * @returns Promise with data and error
 */
export async function invokeExternalFunction<T = unknown>(
  functionName: string,
  body: Record<string, unknown> = {},
  options: { method?: 'POST' | 'GET' } = {}
): Promise<{ data: T | null; error: Error | null }> {
  const method = options.method || 'POST';
  let url = `${EXTERNAL_SUPABASE_URL}/functions/v1/${functionName}`;
  
  try {
    // Add query params for GET requests
    if (method === 'GET' && body && Object.keys(body).length > 0) {
      const params = new URLSearchParams();
      Object.entries(body).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      });
      url += `?${params.toString()}`;
    }

    // Get current session for auth
    const { data: { session } } = await externalSupabase.auth.getSession();
    const token = session?.access_token || EXTERNAL_SUPABASE_ANON_KEY;

    console.log(`[Supabase] Invoking ${functionName} via ${method}...`);
    
    // Setup request init
    const init: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': EXTERNAL_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      },
    };

    if (method === 'POST') {
      init.body = JSON.stringify(body);
    }

    // Add a timeout to the fetch call to prevent long buffering
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 second timeout
    init.signal = controller.signal;

    const response = await window.fetch(url, init);
    clearTimeout(timeoutId);
    
    const responseText = await response.text();
    console.log(`[Supabase] ${functionName} response status:`, response.status);

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorData = JSON.parse(responseText);
        if (response.status === 401) {
          errorMessage = errorData.details || errorData.error || "Session Timeout or Unauthorized. Please log in again.";
        } else {
          errorMessage = errorData.error || errorData.message || errorMessage;
        }
      } catch {
        errorMessage = responseText || errorMessage;
      }
      return { data: null, error: new Error(errorMessage) };
    }

    let data: T | null = null;
    try {
      data = JSON.parse(responseText) as T;
    } catch {
      data = responseText as unknown as T;
    }

    return { data, error: null };
  } catch (err: any) {
    console.error(`[Supabase] Exception invoking ${functionName}:`, err);
    if (err.name === 'AbortError') {
      return { data: null, error: new Error(`Request timed out calling ${functionName}. Please try again.`) };
    }
    if (err instanceof TypeError && err.message === 'Failed to fetch') {
      return { 
        data: null, 
        error: new Error(`Network error calling ${functionName}. Please check your connection.`) 
      };
    }
    return { data: null, error: err as Error };
  }
}

export const getExternalSupabaseUrl = () => EXTERNAL_SUPABASE_URL;
