import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://yywvixdnptculxnefhyy.supabase.co";

const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_Q0Msl3r0FahX7y2MsMt_AA_1fE63QR5";

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
