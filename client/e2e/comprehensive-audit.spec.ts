import { test, expect } from '@playwright/test'
import { login, uniqueSuffix } from './helpers'

test.describe('Kapsamlı Sistem Denetimi (20 Nisan 2026 Revizyonu)', () => {
  let projectName: string
  let suffix: string

  test.beforeEach(async ({ page }) => {
    test.setTimeout(180000)
    await login(page)
    suffix = uniqueSuffix()
    projectName = `Audit Proje ${suffix}`
  })

  test('1. Pano ve Finansal Özet Doğrulaması', async ({ page }) => {
    await page.goto('/')
    // Header'daki 'Pano' yazısını bekle (menü ile karışmaması için locator'ı daralt)
    await expect(page.locator('#header-left').getByText('Pano', { exact: true })).toBeVisible()
    
    // Proje seçiliyse kartları kontrol et
    const projectSelect = page.locator('.ant-select-selection-item').first()
    if (await projectSelect.count() > 0) {
      await expect(page.getByText(/Tahakkuk Eden Gelir/i)).toBeVisible()
      await expect(page.getByText(/Tahakkuk Eden Gider/i)).toBeVisible()
      await expect(page.getByText(/Nakit Bakiye/i)).toBeVisible()
    }
  })

  test('2. Üye - Şerefiye Entegrasyonu ve Veri Tutarlılığı', async ({ page }) => {
    // A. Proje ve Blok Oluştur
    await page.goto('/projeler')
    await page.getByRole('button', { name: /yeni proje/i }).click()
    await page.locator('#proje_adi').fill(projectName)
    await page.locator('input[placeholder="Örn: A"]').fill('A')
    await page.locator('#bloklar_0_toplam_daire').fill('2')
    await page.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByText(projectName)).toBeVisible()

    // B. Şerefiye Tablosunu Oluştur
    await page.getByText(projectName).click()
    await page.getByRole('button', { name: /şerefiye tablosu/i }).click()
    await page.getByRole('button', { name: /tabloyu oluştur/i }).click()
    await expect(page.getByText(/şerefiye tablosu oluşturuldu/i)).toBeVisible()

    // C. Üye Oluştur (Yeni Akış: Daire seçimi formda yok)
    await page.goto('/uyeler')
    await page.getByRole('button', { name: /yeni üye/i }).click()
    const memberName = `AuditUye ${suffix}`
    await page.locator('#ad').fill('Audit')
    await page.locator('#soyad').fill(memberName)
    await page.locator('#email').fill(`audit${suffix}@example.com`)
    await page.locator('#tc_kimlik').fill(`123${Math.floor(Math.random() * 10000000).toString().padStart(8, '0')}`)
    
    // Proje seçimi
    await page.locator('.ant-select-selector').first().click()
    await page.getByText(projectName, { exact: true }).click()
    
    await page.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByText(memberName)).toBeVisible()

    // D. Şerefiye Üzerinden Üye Ata
    await page.goto('/projeler')
    await page.getByText(projectName).click()
    await page.getByRole('button', { name: /şerefiye tablosu/i }).click()
    
    // İlk boş daireye üye ata (Turuncu buton)
    await page.getByRole('button', { name: /üyelik ata/i }).first().click()
    await page.locator('.ant-modal-body .ant-select-selector').click()
    await page.getByText(memberName).click()
    await page.getByRole('button', { name: 'Ata' }).click()
    
    // Durum kontrolü (DOLU ve Üye İsmi)
    await expect(page.locator('tr').filter({ hasText: memberName })).toContainText('DOLU')

    // E. Üyeliği Kaldır
    await page.getByRole('button', { name: /üyeliği kaldır/i }).first().click()
    await page.getByRole('button', { name: 'Evet' }).click() // Modal onayı
    await expect(page.locator('tr').first()).toContainText('BOS')
  })

  test('3. Aidat Planlama ve Otomatik Borçlandırma Mantığı', async ({ page }) => {
    await page.goto('/aidatlar/tanimlar')
    await page.getByRole('button', { name: /yeni tanım ekle/i }).click()
    
    const year = new Date().getFullYear() + 1
    // Yıl seçimi (Select)
    await page.locator('.ant-modal-body .ant-form-item').filter({ hasText: 'Yıl' }).locator('.ant-select-selector').click()
    await page.getByText(year.toString(), { exact: true }).last().click()
    
    // Ay seçimi
    await page.locator('.ant-modal-body .ant-form-item').filter({ hasText: 'Ay' }).locator('.ant-select-selector').click()
    await page.getByText('Ocak', { exact: true }).last().click()
    
    await page.locator('#katsayi_tutari').fill('5000')
    await page.getByRole('button', { name: 'Kaydet' }).click()

    // Plan durumunda olduğunu doğrula
    const row = page.locator('tr').filter({ hasText: year.toString() }).filter({ hasText: 'Ocak' })
    await expect(row.getByText('PLAN')).toBeVisible()
  })

  test('4. IBAN Format ve Kopyalama Kontrolü', async ({ page }) => {
    await page.goto('/banka-hesaplari')
    await page.getByRole('button', { name: /yeni hesap/i }).click()
    await page.locator('#banka_adi').fill(`Bank ${suffix}`)
    
    const ibanInput = page.locator('#iban')
    await ibanInput.fill('12345678')
    const val = await ibanInput.inputValue()
    // formatIBANInput logic: 'TR 1234 5678'
    expect(val.startsWith('TR')).toBeTruthy()
    expect(val.includes(' ')).toBeTruthy()

    await ibanInput.fill('TR123456789012345678901234') // 26 chars
    await page.getByRole('button', { name: 'Kaydet' }).click()

    const ibanCell = page.locator('tr').filter({ hasText: `Bank ${suffix}` }).locator('td').nth(3)
    await expect(ibanCell.locator('.anticon-copy')).toBeVisible()
  })

  test('5. Mizan ve Firma Ekstre Uyumluluğu', async ({ page }) => {
    // Proje seçildiğinden emin ol (Dashboard üzerinden veya her sayfada proje select varsa)
    await page.goto('/')
    await page.locator('.ant-select-selection-item').first().click()
    await page.getByText(projectName, { exact: true }).last().click()

    // Mizan Sayfası
    await page.goto('/raporlar/mizan')
    await expect(page.getByText(/Toplam Alacağımız/i)).toBeVisible()
    
    // Firma Ekstre (Cari Hesaplar)
    await page.goto('/cari-hesaplar')
    await expect(page.getByText(/Firma Ekstre/i)).toBeVisible()
  })
})
