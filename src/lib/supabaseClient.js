import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://sifluvnvdgszfchtudkv.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpZmx1dm52ZGdzemZjaHR1ZGt2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk1MTE4NjcsImV4cCI6MjA2NTA4Nzg2N30.mz0BZlU_Pl4gP3z9ZwUDnacUaJ-GO5GHH61gB7FvRLc'

export const supabase = createClient(supabaseUrl, supabaseKey)