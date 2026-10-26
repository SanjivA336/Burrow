// Addresses the build is pointed at (see playwright.config.ts). Nothing at these addresses is
// real: the tests answer every request to them themselves.
export const SUPABASE_URL = 'http://127.0.0.1:54321'
export const API = 'http://127.0.0.1:8010'

// supabase-js keeps the signed-in session in localStorage under a key built from the project's
// host name: "sb-<first part of the host>-auth-token".
export const SESSION_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`

export const HID = '11111111-2222-3333-4444-555555555555'
export const MY_USER_ID = 'fc26ef9e-2077-463e-9d1c-123b0097fd91'
