/**
 * Supabase Client for React Native Apps
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // In a real app we'd use AsyncStorage here for persistence
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
