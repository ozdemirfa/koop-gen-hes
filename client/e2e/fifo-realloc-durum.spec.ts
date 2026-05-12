/**
 * E2E: FIFO Yeniden Dağıt butonu + durum rozeti tutarlılığı (REV-FIFO-04)
 *
 * Kapsam:
 *  - R1: "FIFO Yeniden Dağıt" butonu Üye Detay sayfasında render oluyor
 *  - R2: Aidat Hesapları tablosunda durum rozeti kalan_borc'a göre derived
 *        (kalan > 0 olan satırda "ÖDENDİ" görünmemeli)
 *
 * Not: Bu spec'ler smoke düzeyinde — gerçek realloc çağrısı yapılmaz çünkü
 * tüm üye ödemelerini reset eder ve side-effect oluşturur. Spec sadece UI
 * doğru render olduğunu doğrular.
 */

import { test, expect } from '@playwright/test'
import { hasCreds, login, navigateTo } from './helpers'

test.describe.configure({ mode: 'serial' })

test.describe('REV-FIFO-04: realloc butonu + durum rozeti', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasCreds, 'E2E_USER / E2E_PASSWORD tanımlı değil')
    await login(page)
  })

  test('R1: "FIFO Yeniden Dağıt" butonu Üye Detay sayfasında render oluyor', async ({ page }) => {
    await navigateTo(page, 'Üye')
    await page.waitForLoadState('networkidle')

    const firstRow = page.locator('.ant-table-row').first()
    const rowExists = await firstRow
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!rowExists, 'Üye listesi boş - R1 atlanıyor')

    await firstRow.click()
    await page.waitForLoadState('networkidle')

    // Buton görünür olmalı (Popconfirm trigger)
    const reallocBtn = page.locator('button', { hasText: 'FIFO Yeniden Dağıt' })
    await expect(reallocBtn).toBeVisible({ timeout: 10_000 })
  })

  test('R2: Aidat Hesapları durum rozetinde kalan>0 satırda "ÖDENDİ" yazmaz', async ({ page }) => {
    await navigateTo(page, 'Üye')
    await page.waitForLoadState('networkidle')

    const firstRow = page.locator('.ant-table-row').first()
    const rowExists = await firstRow
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!rowExists, 'Üye listesi boş - R2 atlanıyor')

    await firstRow.click()
    await page.waitForLoadState('networkidle')

    // Aidat Hesapları tab aktif olmalı (default tab)
    const aidatTable = page
      .locator('.ant-tabs-tabpane-active')
      .first()
      .locator('.ant-table-tbody tr')

    const rowCount = await aidatTable.count()
    test.skip(rowCount === 0, 'Aidat kaydı yok - R2 atlanıyor')

    // Her satırda durum rozeti rule'una uygunluk kontrolü:
    // Eğer "Kalan" sütununda 0'dan büyük bir tutar varsa → durum rozeti
    // "ÖDENDİ" olmamalı. Tag içeriği "KISMİ", "GECİKTİ" veya "BEKLİYOR" olmalı.
    for (let i = 0; i < Math.min(rowCount, 10); i++) {
      const row = aidatTable.nth(i)
      const cells = await row.locator('td').allTextContents()
      // Kalan kolonu (5. col, 0-indexed 4: Dönem, Vade, Aidat, Faiz, Tahakkuk, Ödenen, Kalan, Durum, İşlem)
      // Tablo kolonları: Dönem | Vade | Aidat | Faiz | Tahakkuk | Ödenen | Kalan | Durum | İşlem
      const kalanText = cells[6] ?? ''
      const durumText = cells[7] ?? ''

      const hasKalan = /[1-9]/.test(kalanText.replace(/[₺.,\s]/g, ''))
      if (hasKalan) {
        expect(durumText.toUpperCase()).not.toContain('ÖDENDİ')
      }
    }
  })
})
