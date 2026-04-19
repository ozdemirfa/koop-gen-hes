import { test, expect } from '@playwright/test'
import { login, uniqueSuffix } from './helpers'

test.describe(`US-01'den US-04'e Kadar Proje Yönetimi Sayfası Doğrulaması`, () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/projeler')
  })

  test('US-01: Proje Kartı Navigasyonu ve Modal Ayrımı', async ({ page }) => {
    const firstCard = page.locator('.ant-card').first()
    
    // a. Başlığa tıklayarak navigasyon
    const cardTitle = firstCard.locator('[data-testid="card-title"]')
    await cardTitle.click()
    await expect(page).toHaveURL(/\/projeler\/[a-zA-Z0-9-]+/)
    await page.goBack()
    await page.waitForURL(/\/projeler$/)

    // b. Gövdeye tıklayarak navigasyon
    const cardBody = firstCard.locator('[data-testid="card-body"]')
    await cardBody.click({ position: { x: 50, y: 10 } }) 
    await expect(page).toHaveURL(/\/projeler\/[a-zA-Z0-9-]+/)
    await page.goBack()
    await page.waitForURL(/\/projeler$/)

    // c. Sağ ok ikonuna tıklayarak navigasyon
    const arrowIcon = firstCard.locator('[data-testid^="view-project-"]')
    await arrowIcon.click()
    await expect(page).toHaveURL(/\/projeler\/[a-zA-Z0-9-]+/)
    await page.goBack()
    await page.waitForURL(/\/projeler$/)

    // d. 'Düzenle' butonu modal açmalı, navigasyon yapmamalı
    const editBtn = firstCard.locator('[data-testid^="edit-project-"]')
    await editBtn.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(page.url()).toMatch(/\/projeler$/)
    
    // Modal kapat
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
  })

  test('US-02 & US-03: Blok Ekleme, Silme ve Mükerrerlik Testi', async ({ page }) => {
    const projeAdi = `QA-Blok-Projesi-${uniqueSuffix()}`
    
    // 1. Yeni Proje oluştur (2 Bloklu)
    await page.getByRole('button', { name: /yeni proje/i }).click()
    await page.locator('#proje_adi').fill(projeAdi)
    await page.locator('#bloklar_0_blok_adi').fill('Blok-A')
    await page.locator('#bloklar_0_toplam_daire').fill('10')
    await page.getByRole('button', { name: /blok ekle/i }).click()
    await page.locator('#bloklar_1_blok_adi').fill('Blok-B')
    await page.locator('#bloklar_1_toplam_daire').fill('20')
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
    await expect(page.getByText(/proje kaydedildi/i)).toBeVisible()
    await page.waitForTimeout(1000) // Mesajın kaybolmasını bekleme, biraz bekle yeter

    // 2. Düzenle: Bir bloğu sil, birini aynı bırak, birini güncelle
    const card = page.locator('.ant-card').filter({ hasText: projeAdi })
    await card.locator('[data-testid^="edit-project-"]').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    
    // Blok-B'yi sil (2. çöp kutusu ikonu)
    const deleteButtons = page.locator('.ant-btn-dangerous')
    await deleteButtons.nth(1).click() 
    
    // Blok-A ismini aynı bırakıp daire sayısını güncelle
    await page.locator('#bloklar_0_toplam_daire').fill('15')
    
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
    await expect(page.getByText(/proje kaydedildi/i)).toBeVisible()
    await page.waitForTimeout(1000)

    // 3. Veritabanı Mükerrer İsim Hatası Testi
    await card.locator('[data-testid^="edit-project-"]').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    
    await page.getByRole('button', { name: /blok ekle/i }).click()
    await page.locator('#bloklar_1_blok_adi').fill('Blok-A') // MÜKERRER (Zaten mevcut olan isim)
    await page.locator('#bloklar_1_toplam_daire').fill('5')
    
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
    
    // Beklenen: Hata mesajı (Servis tarafında fırlattığımız mesaj)
    await expect(page.getByText(/'Blok-A' isminde bir blok zaten mevcut/i)).toBeVisible()
    
    // Modal kapat
    await page.keyboard.press('Escape')
  })
})
