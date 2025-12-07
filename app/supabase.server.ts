import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types/database.types";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY!;
// SECURITY FIX: Removed console.log that exposed secret key
export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_SECRET_KEY,
);
