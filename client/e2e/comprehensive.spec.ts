import { test, expect } from '@playwright/test'
import { login, uniqueSuffix } from './helpers'

test.describe('Kapsamlı Sistem Testleri', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(180000)
    await login(page)
  })

  test('Proje Yönetimi ve Şerefiye Sıralama', async ({ page }) => {
    const suffix = uniqueSuffix()
    const projeAdi = `Sıralama Test ${suffix}`

    // 1. Yeni Proje Oluştur
    await page.goto('/projeler')
    await page.getByRole('button', { name: /yeni proje/i }).click()
    await page.locator('#proje_adi').fill(projeAdi)
    await page.locator('input[placeholder="Örn: A"]').fill('A')
    await page.locator('#bloklar_0_toplam_daire').fill('15')
    await page.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByText(projeAdi)).toBeVisible()

    // 2. Şerefiye Tablosu Oluştur ve Sıralamayı Kontrol Et
    await page.locator(`[data-testid="project-card-"]`).filter({ hasText: projeAdi }).locator('[data-testid^="view-project-"]').click()
    await page.getByRole('button', { name: /şerefiye tablosu/i }).click()
    await page.getByRole('button', { name: /tabloyu oluştur/i }).click()
    await expect(page.getByText(/şerefiye tablosu oluşturuldu/i)).toBeVisible()

    // Daire Sıra No sütununa göre sıralamayı doğrula (1, 2, 10...)
    const rows = page.locator('tr.ant-table-row')
    const firstNo = await rows.nth(0).locator('td').nth(1).innerText()
    const lastNo = await rows.nth(9).locator('td').nth(1).innerText()
    
    expect(Number(firstNo)).toBe(1)
    expect(Number(lastNo)).toBe(10)
  })

  test('Banka-Cari Entegrasyonu ve Otomatik Kayıt', async ({ page }) => {
    const suffix = uniqueSuffix()
    const bankaAdi = `Entegrasyon Banka ${suffix}`
    const firmaUnvan = `Entegrasyon Firma ${suffix}`

    // 1. Banka Hesabı Oluştur
    await page.goto('/banka-hesaplari')
    await page.getByRole('button', { name: /yeni hesap/i }).click()
    await page.locator('#banka_adi').fill(bankaAdi)
    await page.getByRole('button', { name: 'Kaydet' }).click()

    // 2. Firma Oluştur
    await page.goto('/firmalar')
    await page.getByRole('button', { name: /yeni firma/i }).click()
    await page.locator('#unvan').fill(firmaUnvan)
    await page.locator('#firma_tipi').click()
    await page.getByText('Tedarikçi').click()
    await page.getByRole('button', { name: 'Kaydet' }).click()

    // 3. Banka Hareketi Ekle (Firma Seçerek)
    await page.goto('/banka-hesaplari')
    await page.getByText(bankaAdi).click()
    await page.getByRole('button', { name: /yeni hareket/i }).click()
    await page.locator('#islem_tipi').click()
    await page.getByText('Para Çıkışı (-)').click()
    await page.locator('#firma_id').click()
    await page.getByText(firmaUnvan).click()
    await page.locator('#tutar').fill('2500')
    await page.locator('#aciklama').fill(`Otomatik Cari Test ${suffix}`)
    await page.getByRole('button', { name: 'Ekle' }).click()

    // 4. Cari Ekstrede Kontrol Et
    await page.goto('/firmalar')
    await page.getByText(firmaUnvan).click()
    await page.getByRole('tab', { name: /cari ekstre/i }).click()
    await expect(page.getByText(`Otomatik Cari Test ${suffix}`)).toBeVisible()
    await expect(page.getByText('2.500,00')).toBeVisible()
  })

  test('Gelişmiş Yıllık Plan Yönetimi', async ({ page }) => {
    const suffix = uniqueSuffix()
    const projeAdi = `Plan Yönetim ${suffix}`
    const kalem1 = `Harcama 1 ${suffix}`
    const kalem2 = `Harcama 2 ${suffix}`

    // 1. Proje ve Harcama Kalemi Oluştur
    await page.goto('/projeler')
    await page.getByRole('button', { name: /yeni proje/i }).click()
    await page.locator('#proje_adi').fill(projeAdi)
    await page.locator('input[placeholder="Örn: A"]').fill('A')
    await page.locator('#bloklar_0_toplam_daire').fill('5')
    await page.getByRole('button', { name: 'Kaydet' }).click()
    
    await page.locator(`[data-testid="project-card-"]`).filter({ hasText: projeAdi }).locator('[data-testid^="view-project-"]').click()
    await page.getByRole('button', { name: /harcama kalemi ekle/i }).click()
    await page.locator('#tanim').fill(kalem1)
    await page.locator('#butce_tutari').fill('50000')
    await page.getByRole('button', { name: 'Kaydet' }).click()

    // 2. Plan Oluştur
    await page.getByRole('button', { name: /yıllık plan/i }).click()
    await page.getByRole('button', { name: /şimdi oluştur/i }).click()
    await expect(page.getByText(kalem1)).toBeVisible()

    // 3. Yeni Kalem Ekle ve "Satır Ekle" ile Plana Dahil Et
    await page.goto(page.url().split('/yillik-plan')[0])
    await page.getByRole('button', { name: /harcama kalemi ekle/i }).click()
    await page.locator('#tanim').fill(kalem2)
    await page.getByRole('button', { name: 'Kaydet' }).click()

    await page.getByRole('button', { name: /yıllık plan/i }).click()
    await page.getByRole('button', { name: /satır ekle/i }).click()
    await page.locator('.ant-modal-body .ant-select-selector').click()
    await page.getByText(kalem2).click()
    await page.getByRole('button', { name: 'Ekle' }).click()
    await expect(page.getByText(kalem2)).toBeVisible()

    // 4. Satır Sil
    await page.locator('tr').filter({ hasText: kalem1 }).locator('button.ant-btn-danger').click()
    await page.getByRole('button', { name: 'Evet' }).click()
    await expect(page.getByText(kalem1)).toBeHidden()
  })

  test('Daire Bazlı Aidat ve Üye Bağımsız İzleme', async ({ page }) => {
    const suffix = uniqueSuffix()
    const projeAdi = `Aidat Takip ${suffix}`

    // 1. Proje ve Şerefiye Oluştur
    await page.goto('/projeler')
    await page.getByRole('button', { name: /yeni proje/i }).click()
    await page.locator('#proje_adi').fill(projeAdi)
    await page.locator('input[placeholder="Örn: A"]').fill('C')
    await page.locator('#bloklar_0_toplam_daire').fill('2')
    await page.getByRole('button', { name: 'Kaydet' }).click()

    await page.locator(`[data-testid="project-card-"]`).filter({ hasText: projeAdi }).locator('[data-testid^="view-project-"]').click()
    await page.getByRole('button', { name: /şerefiye tablosu/i }).click()
    await page.getByRole('button', { name: /tabloyu oluştur/i }).click()

    // 2. Aidat Planı Oluştur
    await page.goto('/aidatlar')
    await page.getByRole('button', { name: /yıllık plan oluştur/i }).click()
    await page.locator('button:has-text("Oluştur")').click()
    await expect(page.getByText(/yıllık aidat planı oluşturuldu/i)).toBeVisible()

    // 3. Üye Olmayan Dairelerin Listelendiğini Doğrula
    await expect(page.getByText('C - 1')).toBeVisible()
    await expect(page.getByText('C - 2')).toBeVisible()
    await expect(page.getByText(/üye yok/i).first()).toBeVisible()
  })
})
