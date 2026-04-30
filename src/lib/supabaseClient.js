import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Safe localStorage wrapper — prevents SecurityError crashing the app
// in Android/iOS in-app browsers (Instagram, TikTok, Facebook etc.)
// where localStorage access is blocked by browser policy.
const safeStorage = {
  getItem: (key) => {
    try { return localStorage.getItem(key) } catch { return null }
  },
  setItem: (key, value) => {
    try { localStorage.setItem(key, value) } catch {}
  },
  removeItem: (key) => {
    try { localStorage.removeItem(key) } catch {}
  },
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: safeStorage,
  },
})