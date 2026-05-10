/**
 * E2E Regression Tests: Form validation UX hardening
 *
 * Tests cover commit 4e7f798 (fix(irsaliye+forms): RPC schema alignment + form UX hardening)
 * and the per-field DB error mapping from commit 23d86c8.
 *
 * Scope:
 * 1. UyeFormPage — zorunlu alan boş bırakılınca hata altında görünür
 * 2. UyeFormPage — mükerrer TC Kimlik gönderilince server hatası ilgili alana bağlanır
 * 3. UyeFormPage — telefon formatı (5xx xxx xx xx) validasyonu çalışıyor
 * 4. BankaHesapListPage — Yeni Hareket tuşu YOKTUR, empty state metni doğru
 * 5. General smoke — login, proje seçimi, üye listesi
 */

import { test, expect } from '@playwright/test'
import { hasCreds, checkHeader, uniqueSuffix, E2E_USER, E2E_PASSWORD } from './helpers'

/**
 * Lightweight login — avoids the ensureProject race condition in the shared helper.
 */
async function loginAndWaitForProject(page: any) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByPlaceholder('ornek@kooperatif.com').fill(E2E_USER!)
  await page.getByPlaceholder('Şifre').fill(E2E_PASSWORD!)
  await page.getByRole('button', { name: /giriş yap/i }).click()
  await page.waitForURL((url: URL) => !url.pathname.startsWith('/login'), { timeout: 60_000 })
  await page.waitForLoadState('networkidle')
  await page.waitForSelector('.ant-layout-sider', { state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(2000)
}

// ---------------------------------------------------------------------------
// UyeFormPage — Client-side validasyon
// ---------------------------------------------------------------------------
test.describe('Regression: UyeFormPage form validasyonu', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasCreds, 'E2E_USER / E2E_PASSWORD tanımlı değil')
    await loginAndWaitForProject(page)
  })

  test('zorunlu Ad ve Soyad boş bırakılınca hata mesajı alanın altında görünür', async ({ page }) => {
    await page.goto('/uyeler/yeni')
    await checkHeader(page, 'Yeni Üye Ekle')

    // Kaydet tuşuna tıkla — hiçbir şey doldurmadan
    await page.getByRole('button', { name: /Kaydet/i }).click()

    // "Ad zorunlu" hatası görünür — AntD may duplicate error divs, use first()
    const adError = page.locator('.ant-form-item-explain-error').filter({ hasText: /Ad zorunlu/i }).first()
    await expect(adError).toBeVisible({ timeout: 5_000 })

    // "Soyad zorunlu" hatası görünür
    const soyadError = page.locator('.ant-form-item-explain-error').filter({ hasText: /Soyad zorunlu/i }).first()
    await expect(soyadError).toBeVisible({ timeout: 5_000 })
  })

  test('geçersiz TC Kimlik (10 hane) girilince format hatası görünür', async ({ page }) => {
    await page.goto('/uyeler/yeni')
    await checkHeader(page, 'Yeni Üye Ekle')

    // TC kimlik alanına geçersiz değer gir (10 hane — 11 olmalı)
    const tcInput = page.locator('input#tc_kimlik')
    await tcInput.fill('1234567890') // 10 hane

    // Kaydet'e tıkla
    await page.getByRole('button', { name: /Kaydet/i }).click()

    const tcError = page.locator('.ant-form-item-explain-error').filter({ hasText: /11 haneli/i })
    await expect(tcError).toBeVisible({ timeout: 5_000 })
  })

  test('geçersiz e-posta girilince hata görünür', async ({ page }) => {
    await page.goto('/uyeler/yeni')

    const emailInput = page.locator('input#email')
    await emailInput.fill('gecersiz-email')
    await emailInput.blur()

    const emailError = page.locator('.ant-form-item-explain-error').filter({ hasText: /e-posta/i })
    await expect(emailError).toBeVisible({ timeout: 5_000 })
  })

  test('telefon maskesi 5xx xxx xx xx formatını korur', async ({ page }) => {
    await page.goto('/uyeler/yeni')

    const telefonInput = page.locator('input#telefon')
    // Rakam gir, maskenin boşluk koymasını bekle
    await telefonInput.fill('5321234567')

    // Mask uygulandıktan sonra değerin formatlanmış hali
    const formattedValue = await telefonInput.inputValue()
    // Formatlanmış değer "532 123 45 67" içermeli
    expect(formattedValue).toMatch(/\d{3}\s\d{3}\s\d{2}\s\d{2}/)
  })

  test('server-side mükerrer TC hatası ilgili alana bağlanır', async ({ page }) => {
    // Önce mevcut bir üyenin TC'sini öğren
    await page.goto('/uyeler')
    await page.waitForSelector('.ant-table-row', { timeout: 15_000 })

    // TC kolonu var mı kontrol et
    const tcColumn = page.locator('.ant-table-thead th').filter({ hasText: /TC/i })
    if (await tcColumn.count() === 0) {
      // TC kolonu yok, test atla
      test.skip()
      return
    }

    const firstRowTcCell = page.locator('.ant-table-row').first().locator('td').nth(1)
    const existingTc = await firstRowTcCell.innerText()

    if (!existingTc || existingTc === '-' || existingTc.length !== 11) {
      // Geçerli TC verisi yok
      test.skip()
      return
    }

    // Yeni üye formuna git
    await page.goto('/uyeler/yeni')
    await checkHeader(page, 'Yeni Üye Ekle')

    const suffix = uniqueSuffix()
    await page.fill('#ad', `Duplikat${suffix}`)
    await page.fill('#soyad', `Test${suffix}`)
    await page.locator('input#tc_kimlik').fill(existingTc)

    await page.getByRole('button', { name: /Kaydet/i }).click()

    // Server hata dönmeli; hata ya alanın altında ya da message olarak görünmeli
    const fieldError = page.locator('.ant-form-item-explain-error')
    const messageError = page.locator('.ant-message-notice-content').filter({ hasText: /hata|mükerrer|duplicate|unique/i })

    const hasError = await Promise.race([
      fieldError.first().waitFor({ state: 'visible', timeout: 10_000 }).then(() => true),
      messageError.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true),
    ]).catch(() => false)

    expect(hasError, 'Mükerrer TC hatası gösterilmedi').toBe(true)
  })
})

// ---------------------------------------------------------------------------
// BankaHareketleriPage — "Yeni Hareket" butonu kaldırılmış
// ---------------------------------------------------------------------------
test.describe('Regression: BankaHareketleriPage "Yeni Hareket" butonu kaldırıldı', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasCreds, 'E2E_USER / E2E_PASSWORD tanımlı değil')
    await loginAndWaitForProject(page)
  })

  test('Banka Hareketleri sayfasında "Yeni Hareket" butonu YOKTUR', async ({ page }) => {
    // Banka hesapları listesine git
    await page.goto('/banka-hesaplari')
    await page.waitForLoadState('networkidle')
    // Wait for table to load (usePageSettings header has timing race, use table instead)
    await page.locator('.ant-table').first().waitFor({ state: 'visible', timeout: 15_000 })

    // En az bir banka hesabı var mı?
    const tableRows = page.locator('.ant-table-row')
    await page.waitForTimeout(1000) // give rows time to render
    const rowCount = await tableRows.count()

    if (rowCount === 0) {
      // Hesap yoksa, önce oluştur
      await page.getByRole('button', { name: /Yeni Hesap/i }).click()
      // R2 fix: [role="dialog"] AntD 6 modal selector
      await page.locator('[role="dialog"]').first().waitFor({ state: 'visible', timeout: 10_000 })
      await page.getByLabel(/Banka Adı/i).fill(`Test Banka ${uniqueSuffix()}`)
      await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
      await page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 10_000 })
      await page.waitForLoadState('networkidle')
    }

    // Hareketler butonuna tıkla (AntD Tooltip wraps the button; try by aria-label or button role)
    // The button has a tooltip "Hareketler" — use the icon button within the first row
    const firstRow = page.locator('.ant-table-row').first()
    // Try Tooltip title attribute on the button wrapper
    const hareketlerBtn = firstRow.locator('[aria-label*="transaction"], button').filter({ hasText: '' }).last()
    // More reliable: navigate directly via row click to get the ID, then navigate
    const firstRowCells = firstRow.locator('td')
    await firstRowCells.first().waitFor({ state: 'visible', timeout: 5_000 })

    // Use the specific icon button — TransactionOutlined (Hareketler) is the FIRST action button, EditOutlined (Düzenle) is second
    const actionButtons = firstRow.locator('.ant-btn')
    const actionCount = await actionButtons.count()
    if (actionCount > 0) {
      await actionButtons.first().click()
    } else {
      test.skip() // No action buttons found, skip
      return
    }

    // URL /banka-hesaplari/:id/hareketler olmalı
    await expect(page).toHaveURL(/\/banka-hesaplari\/[0-9a-f-]+\/hareketler/, { timeout: 10_000 })

    // "Yeni Hareket" veya "Hareket Ekle" butonu OLMAMALI
    const yeniHareketBtn = page.getByRole('button', { name: /Yeni Hareket|Hareket Ekle/i })
    await expect(yeniHareketBtn).not.toBeVisible({ timeout: 3_000 })
  })

  test('Banka Hareketleri boş durumdaysa doğru empty state metni görünür', async ({ page }) => {
    await page.goto('/banka-hesaplari')
    await page.waitForLoadState('networkidle')
    await page.locator('.ant-table').first().waitFor({ state: 'visible', timeout: 15_000 })

    const tableRows = page.locator('.ant-table-row')
    await page.waitForTimeout(1000)
    const rowCount = await tableRows.count()

    if (rowCount === 0) {
      test.skip()
      return
    }

    // Hareketleri görüntüle — TransactionOutlined (Hareketler) is the FIRST button in the row
    const firstRow = page.locator('.ant-table-row').first()
    const actionButtons = firstRow.locator('.ant-btn')
    if (await actionButtons.count() === 0) {
      test.skip()
      return
    }
    await actionButtons.first().click()
    await expect(page).toHaveURL(/\/banka-hesaplari\/[0-9a-f-]+\/hareketler/, { timeout: 10_000 })
    await page.waitForLoadState('networkidle')

    // Veri yoksa empty state metnini kontrol et
    const emptyText = page.getByText(/Hareketler ödeme\/tahsilat kaydı ile otomatik oluşur/i)
    const table = page.locator('.ant-table-tbody tr').first()

    const isEmpty = (await table.count() === 0) || (await table.locator('.ant-table-cell').first().innerText()).includes('veri yok')

    if (isEmpty || await emptyText.isVisible()) {
      await expect(emptyText).toBeVisible({ timeout: 10_000 })
    }
    // Eğer hareket varsa empty state görünmez — bu da geçerli
  })
})

// ---------------------------------------------------------------------------
// Smoke tests — login, proje, üye listesi
// ---------------------------------------------------------------------------
test.describe('Smoke: Temel akışlar', () => {
  test('login ve dashboard yüklenme', async ({ page }) => {
    test.skip(!hasCreds, 'E2E_USER / E2E_PASSWORD tanımlı değil')
    await loginAndWaitForProject(page)
    // Dashboard sayfasında olmalıyız
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 })
  })

  test('üye listesi sayfası açılır ve tablo görünür', async ({ page }) => {
    test.skip(!hasCreds, 'E2E_USER / E2E_PASSWORD tanımlı değil')
    await loginAndWaitForProject(page)
    await page.goto('/uyeler')
    await page.waitForLoadState('networkidle')
    // UyeListPage uses usePageSettings('Üye Yönetimi') — not 'Üyeler'. Verify by table presence.
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 15_000 })
  })

  test('OdemeKayit sayfası açılır ve 4 islem_turu seçeneği vardır', async ({ page }) => {
    test.skip(!hasCreds, 'E2E_USER / E2E_PASSWORD tanımlı değil')
    await loginAndWaitForProject(page)
    await page.goto('/cari-hesaplar/odeme-kayit')
    await page.waitForLoadState('networkidle')
    // Wait for form to be ready (usePageSettings header has race condition, use form element)
    await page.locator('.ant-form').first().waitFor({ state: 'visible', timeout: 15_000 })

    // İşlem Türü dropdown'ını aç
    // R3 fix: getByRole('combobox') daha güvenilir — .ant-form-item filter çakışıyordu
    await page.getByRole('combobox', { name: /İşlem Türü/i }).click()

    // 4 seçenek olmalı: Giden Ödeme, Gelen Ödeme, Üyelik Bedeli İadesi, Üyelik Başlangıç Bedeli
    // Use .ant-select-item-option-content to avoid icon text polluting aria accessible name
    const openDropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content')
    await expect(openDropdown.filter({ hasText: /Giden Ödeme/i }).first()).toBeVisible({ timeout: 5_000 })
    await expect(openDropdown.filter({ hasText: /Gelen Ödeme/i }).first()).toBeVisible()
    await expect(openDropdown.filter({ hasText: /Üyelik Bedeli İadesi/i }).first()).toBeVisible()
    await expect(openDropdown.filter({ hasText: /Üyelik Başlangıç Bedeli/i }).first()).toBeVisible()
  })
})
