import { createClient } from '@supabase/supabase-js';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.local.example to .env.local and fill in your project credentials.');
}
// Tauri's webview (WebView2 on Windows, WKWebView on macOS) persists localStorage
// to disk like a normal browser, so the default Supabase Auth storage works here.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true
    }
});
