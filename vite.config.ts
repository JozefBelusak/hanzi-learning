import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { Buffer } from 'node:buffer'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const key = loadEnv(mode, process.cwd(), 'VITE_SUPABASE_').VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
  let role: unknown
  try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role } catch { /* Publishable keys are not JWTs. */ }
  if (key.startsWith('sb_secret_') || role === 'service_role') {
    throw new Error('Use a public Supabase publishable/anon key. Secret and service_role keys must never enter the frontend build.')
  }
  return { plugins: [react()], build: { chunkSizeWarningLimit: 650 } }
})
