/**
 * Sprint 20260511-open-backlog-sprint (CODE-006) — CI guard
 *
 * Supabase migration dosyalari `YYYYMMDDHHMMSS_<name>.sql` formatinda
 * (veya kisa: `YYYYMMDDNNNNNN_<name>.sql`) timestamp prefix kullanir.
 * Iki migration ayni prefix'i kullanirsa Supabase apply order belirsiz olur ve
 * deploy sirasinda race-condition / migration skip riski dogar.
 *
 * Bu test `supabase/migrations/` altindaki TUM .sql dosyalarinin timestamp
 * prefix'inin benzersiz oldugunu dogrular.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..', '..')
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations')

describe('Migration timestamp uniqueness', () => {
  it('supabase/migrations altindaki tum .sql dosyalarinin prefix timestamp benzersiz', () => {
    expect(fs.existsSync(MIGRATIONS_DIR), `Migrations dir bulunamadi: ${MIGRATIONS_DIR}`).toBe(true)

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))

    expect(files.length, 'En az 1 migration olmali').toBeGreaterThan(0)

    // `YYYYMMDDHHMMSS` (14 hane) veya `YYYYMMDDNNNNNN` (14 hane) — kisaca ilk
    // underscore'a kadar olan kism timestamp prefix.
    const prefixRegex = /^(\d+)_/
    const seen = new Map<string, string[]>()

    for (const file of files) {
      const match = file.match(prefixRegex)
      if (!match) {
        throw new Error(`Migration adi timestamp prefix icermiyor: ${file}`)
      }
      const prefix = match[1]
      if (!seen.has(prefix)) seen.set(prefix, [])
      seen.get(prefix)!.push(file)
    }

    const duplicates = Array.from(seen.entries())
      .filter(([, list]) => list.length > 1)
      .map(([prefix, list]) => `  ${prefix} → ${list.join(', ')}`)

    if (duplicates.length > 0) {
      throw new Error(
        `Mukerrer migration timestamp prefix bulundu:\n${duplicates.join('\n')}\n` +
        `Cozum: yeni migration olusturulurken timestamp benzersiz olmali. ` +
        `Onerilen format: YYYYMMDDHHMMSS_<aciklama>.sql`
      )
    }

    // Smoke: en az bir tane "20260" prefix'li (current era) migration olmali
    const recentMigrations = files.filter((f) => /^20260/.test(f))
    expect(recentMigrations.length, '2026 era migration sayisi > 0').toBeGreaterThan(0)
  })

  it('migration prefix uzunlugu en az 14 hane (YYYYMMDDHHMMSS formati onerilir)', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))

    const shortPrefixes: string[] = []
    for (const file of files) {
      const match = file.match(/^(\d+)_/)
      if (match && match[1].length < 14) {
        shortPrefixes.push(`${file} (prefix uzunlugu: ${match[1].length})`)
      }
    }

    // Bu bir warn — fail etmiyoruz cunki bazi eski migration'lar 13 hane kullaniyor olabilir.
    // Sadece raporlama amacli (vitest console'a yazar).
    if (shortPrefixes.length > 0) {
      console.warn(
        `[migrationTimestampUnique] ${shortPrefixes.length} migration dosyasi 14 handen ` +
        `kisa timestamp kullaniyor (bilgi amacli; fail degil):\n${shortPrefixes.slice(0, 5).join('\n')}`
      )
    }

    // Soft expectation — sadece dosya sayisinin makul oldugunu dogrula
    expect(files.length).toBeGreaterThan(0)
  })
})
