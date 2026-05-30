import { test, expect } from '@playwright/test'
import { login, uniqueSuffix } from './helpers'

// Sprint yonetim-ekibi (2026-05-30): Yönetim ekibi (management team) E2E.
// Defansif/smoke stil (repo konvansiyonu): seed/veri yoksa graceful geçer.
//
// Kapsam:
//   1. Proje detayından "Yönetim Ekibi" ikon butonu ile sayfaya erişim
//   2. Yönetim carisi ekle → tabloda borç/alacak/bakiye görünür
//   3. Ödeme/Tahsilat ekranında "Yönetim" cari türü + işlem türü kısıtı
//      (yalnız gelen/giden ödeme) + ödeme aracı (yalnız nakit/banka)

test.describe('Yönetim Ekibi', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  // Aktif projenin detay sayfasına git, "Yönetim Ekibi" ikonuna tıkla.
  async function gotoYonetimEkibi(page: import('@playwright/test').Page) {
    await page.goto('/projeler')
    await page.waitForLoadState('networkidle')
    const firstRow = page.locator('.ant-table-row').first()
    if ((await firstRow.count()) === 0) return false
    await firstRow.click()
    // Proje detay yüklendi mi? Header'daki Yönetim Ekibi ikonunu bekle.
    const ikon = page.getByRole('button', { name: 'Yönetim Ekibi' })
    await ikon.waitFor({ state: 'visible', timeout: 15_000 })
    await ikon.click()
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\/projeler\/[^/]+\/yonetim-ekibi/)
    return true
  }

  test('proje detayından Yönetim Ekibi sayfasına erişilir', async ({ page }) => {
    const ok = await gotoYonetimEkibi(page)
    if (!ok) {
      // Proje yoksa smoke geç
      await expect(page.locator('.ant-table')).toBeVisible()
      return
    }
    // Bilgilendirme alert'i (Proje Huzur Hakkı Oranı) görünür
    await expect(page.getByText(/Huzur Hakkı Oranı/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test('yönetim carisi eklenir ve tabloda borç/alacak/bakiye gösterilir', async ({ page }) => {
    const ok = await gotoYonetimEkibi(page)
    if (!ok) {
      await expect(page.locator('.ant-table')).toBeVisible()
      return
    }

    const adSoyad = `E2E Yönetici ${uniqueSuffix()}`
    await page.getByRole('button', { name: /yeni yönetim carisi/i }).click()
    await page.locator('[role="dialog"]').first().waitFor({ state: 'visible', timeout: 10_000 })

    await page.locator('#ad_soyad').fill(adSoyad)
    // Oran InputNumber — modal içindeki ilk number input
    await page.locator('[role="dialog"] .ant-input-number-input').first().fill('30')

    await page.locator('.ant-modal-footer button:has-text("Kaydet")').click()
    await page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 15_000 })

    // Yeni cari tabloda görünür + başlangıç bakiyeleri
    const row = page.locator('.ant-table-row', { hasText: adSoyad })
    await expect(row).toBeVisible({ timeout: 10_000 })
    await expect(row).toContainText('%30')
    // Borç/Alacak başlangıç 0 → bakiye 0,00 TL
    await expect(row).toContainText('0,00 TL')
  })

  test('Ödeme ekranında Yönetim türü işlem ve ödeme aracını kısıtlar', async ({ page }) => {
    await page.goto('/cari-hesaplar/odeme-kayit')
    await page.waitForLoadState('networkidle')

    // "Yönetim" radio butonu mevcut mu?
    const yonetimRadio = page.getByRole('radio', { name: 'Yönetim' })
    if ((await yonetimRadio.count()) === 0) {
      // Sayfa farklı route'ta olabilir — smoke geç
      await expect(page.locator('form')).toBeVisible()
      return
    }
    await yonetimRadio.click()

    // İşlem Türü Select'i aç → yalnız Giden/Gelen Ödeme görünmeli;
    // "Üyelik Bedeli İadesi" / "Üyelik Başlangıç Bedeli" GÖRÜNMEMELİ.
    await page.locator('#islem_turu').click()
    await expect(page.locator('.ant-select-item-option', { hasText: /giden ödeme/i })).toBeVisible()
    await expect(page.locator('.ant-select-item-option', { hasText: /gelen ödeme/i })).toBeVisible()
    await expect(page.locator('.ant-select-item-option', { hasText: /üyelik/i })).toHaveCount(0)
    await page.keyboard.press('Escape')

    // Ödeme Aracı Select'i aç → Kredi Kartı GÖRÜNMEMELİ (yalnız nakit/banka).
    await page.locator('#odeme_turu').click()
    await expect(page.locator('.ant-select-item-option', { hasText: /nakit/i })).toBeVisible()
    await expect(page.locator('.ant-select-item-option', { hasText: /kredi kart/i })).toHaveCount(0)
    await page.keyboard.press('Escape')
  })
})
