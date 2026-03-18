/**
 * External Supabase Client
 * 
 * This module provides direct access to the external Supabase project,
 * bypassing Lovable Cloud's automatic credential injection.
 * 
 * Use this for edge function calls that need to go to the external backend.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

import { supabase } from '@/integrations/supabase/client';

// Hardcoded external Supabase credentials
// These bypass Lovable Cloud's runtime injection
export const EXTERNAL_SUPABASE_URL = "https://hwhhgprivdgdbnlqruln.supabase.co";
export const EXTERNAL_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3aGhncHJpdmRnZGJubHFydWxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxMDI5NzMsImV4cCI6MjA4MjY3ODk3M30.aLofF1z4cd7fbg-bSOVMj-bRo5uyEaNYDBL7XvFhwLg";

// Create the external Supabase client
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
 * Invoke an edge function on the external Supabase project
 * Uses native fetch to bypass Lovable's fetch wrapper that can block cross-origin calls.
 * 
 * @param functionName - Name of the edge function
 * @param body - Request body to send
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

    // Get current session for auth - Use the same client we use for external calls
    const { data: { session } } = await externalSupabase.auth.getSession();
    const token = session?.access_token || EXTERNAL_SUPABASE_ANON_KEY;

    console.log(`[ExternalSupabase] Invoking ${functionName} via ${method} on ${url}... (Auth: ${!!session ? 'External JWT' : 'Anon/Default'})`);
    
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

    const response = await window.fetch(url, init);
    const responseText = await response.text();
    console.log(`[ExternalSupabase] ${functionName} response status:`, response.status);

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorData = JSON.parse(responseText);
        if (response.status === 401) {
          errorMessage = errorData.details || errorData.error || "Session Timeout or Unauthorized. Please log in again.";
          if (errorData.debug_info) {
             console.error('[ExternalSupabase] Auth Debug Details:', errorData.debug_info);
             errorMessage += ` (Debug: ${JSON.stringify(errorData.debug_info)})`;
          }
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
  } catch (err) {
    console.error(`[ExternalSupabase] Exception invoking ${functionName}:`, err);
    if (err instanceof TypeError && err.message === 'Failed to fetch') {
      return { 
        data: null, 
        error: new Error(`Network error calling ${functionName}. This may be a CORS issue.`) 
      };
    }
    return { data: null, error: err as Error };
  }
}

// Export URL for debugging
export const getExternalSupabaseUrl = () => EXTERNAL_SUPABASE_URL;
