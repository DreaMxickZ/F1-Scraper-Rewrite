// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

// Client-side (anon key) — ใช้ใน dashboard
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Server-side (service role) — ใช้ใน API routes เท่านั้น
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
