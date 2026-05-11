/**
 * TASK-BE-05 (sprint 20260511-backlog-batch1) — CI grep guard
 *
 * Service role key, Vite'in `VITE_` prefix'li ortam degiskeni mekanizmasi
 * uzerinden client tarafa SIZAMAZ. Bu test, client/ ve server/ kaynak agacinda
 * `VITE_SUPABASE_SERVICE_ROLE_KEY` referansi olup olmadigini denetler.
 *
 * Beklenen sonuc: hicbir kaynak dosyada bu sembol yer almamali (test/log
 * dosyalari haric).
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..', '..')
const FORBIDDEN_SYMBOL = 'VITE_SUPABASE_SERVICE_ROLE_KEY'

// Aranacak dizinler (proje koklerinden goreli).
const SCAN_DIRS = [
  path.join(ROOT, 'server', 'src'),
  path.join(ROOT, 'client', 'src'),
]

// Tarama disinda tutulacak yol parcalari.
const EXCLUDE_FRAGMENTS = [
  path.sep + 'node_modules' + path.sep,
  path.sep + 'dist' + path.sep,
  path.sep + 'build' + path.sep,
  path.sep + '.next' + path.sep,
  path.sep + 'tests' + path.sep,
  path.sep + '__tests__' + path.sep,
]

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

function walk(dir: string, out: string[]): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (EXCLUDE_FRAGMENTS.some((frag) => full.includes(frag))) continue
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (entry.isFile() && SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full)
    }
  }
}

describe('CI guard — VITE_SUPABASE_SERVICE_ROLE_KEY must not appear in source', () => {
  it('does not reference VITE_SUPABASE_SERVICE_ROLE_KEY in server/ or client/ source', () => {
    const files: string[] = []
    for (const dir of SCAN_DIRS) {
      if (fs.existsSync(dir)) walk(dir, files)
    }

    const offenders: string[] = []
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8')
      if (text.includes(FORBIDDEN_SYMBOL)) {
        offenders.push(path.relative(ROOT, file))
      }
    }

    expect(offenders, `Forbidden symbol leaked into: ${offenders.join(', ')}`).toEqual([])
  })
})
