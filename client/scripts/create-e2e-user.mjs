import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = process.env.E2E_USER
const password = process.env.E2E_PASSWORD

if (!url || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!email || !password) {
  console.error('Missing E2E_USER or E2E_PASSWORD')
  process.exit(1)
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
if (listErr) {
  console.error('listUsers error:', listErr.message)
  process.exit(1)
}

const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())

if (existing) {
  const { error: updErr } = await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
  })
  if (updErr) {
    console.error('updateUserById error:', updErr.message)
    process.exit(1)
  }
  console.log(`Updated existing E2E user: ${email} (id=${existing.id})`)
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) {
    console.error('createUser error:', error.message)
    process.exit(1)
  }
  console.log(`Created E2E user: ${email} (id=${data.user?.id})`)
}
