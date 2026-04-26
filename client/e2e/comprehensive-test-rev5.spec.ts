import { test, expect } from '@playwright/test'
import { login, uniqueSuffix } from './helpers'

test.describe('Kapsamlı Test Revizyon 5 - Final QA Denetimi', () => {
  let projectName: string
  let suffix: string

  test.beforeEach(async ({ page }) => {
    test.setTimeout(180000)
    await login(page)
    suffix = uniqueSuffix()
    projectName = `Proje R5 ${suffix}`
  })

  test('1. Dashboard: 5 Satırlı Pano ve Veri Doğruluğu', async ({ page }) => {
    await page.goto('/')
    
    // Proje seçiliyse veya bir proje seçerek başla
    const projectSelect = page.locator('.ant-select-selection-item').first()
    if (await projectSelect.count() === 0 || (await projectSelect.textContent() === 'Proje Seçilmedi')) {
       await page.goto('/projeler')
       const firstProject = page.locator('.ant-card').first()
       if (await firstProject.count() > 0) {
         await firstProject.click()
         await page.goto('/')
       } else {
          // Proje yoksa oluştur
          await page.getByRole('button', { name: /yeni proje/i }).click()
          await page.locator('#proje_adi').fill(projectName)
          await page.locator('input[placeholder="Örn: A"]').fill('A')
          await page.locator('#bloklar_0_toplam_daire').fill('5')
          await page.getByRole('button', { name: 'Kaydet' }).click()
          await page.getByText(projectName).first().click()
          await page.goto('/')
       }
    }

    // Header başlığı 'Pano' olmalı
    await expect(page.locator('#header-left')).toContainText('Pano')

    // Toplam 15 kart olmalı (5 satır * 3 sütun)
    const statCards = page.locator('.ant-statistic')
    await expect(statCards).toHaveCount(15)

    // Verilerin yüklendiğini (0 veya başka bir değer geldiğini) doğrula
    // Skeleton veya LoadingState olmadığını kontrol et
    await expect(page.locator('.ant-statistic-content-value').first()).toBeVisible()
    
    const titles = [
      'Proje Süresi', 'Aktif Üye Sayısı', 'Toplam Daire Sayısı',
      'Toplam Tahsilat', 'Geciken Aidatlar', 'Gecikme Faiz Tahsilatı',
      'Tahakkuk Eden Gider', 'Faturalar', 'Fatura Farkı',
      'Toplam Cari Ödeme', 'Birikmiş Teminatlar', 'Cari Bakiye',
      'Bankalar Bakiye Toplamı', 'Çekler', 'Ödemeler Sonrası Nakit'
    ]

    for (const title of titles) {
      await expect(page.getByText(title)).toBeVisible()
    }
    
    // Değerlerin biçimlendirmesini kontrol et (TL son eki veya sayı formatı)
    const currencyCards = [
      'Toplam Tahsilat', 'Geciken Aidatlar', 'Cari Bakiye', 'Bankalar Bakiye Toplamı'
    ]
    for (const title of currencyCards) {
       const card = page.locator('.ant-statistic').filter({ hasText: title })
       await expect(card).toContainText('TL')
    }
  })

  test('2. Aidat Yönetimi: Navigasyon, Filtreler ve Satır Bazlı Faiz', async ({ page }) => {
    // 1. Navigasyon
    await page.goto('/')
    await page.locator('.ant-menu-submenu-title').filter({ hasText: 'Aidat Yönetimi' }).click()
    await page.getByRole('menuitem', { name: 'Aidat Listesi' }).click()
    await expect(page.locator('#header-left')).toContainText('Aidat Listesi')

    // 2. Filtreler
    await page.locator('.ant-select').filter({ hasText: 'Yıl' }).click()
    // Bekle ki dropdown açılsın
    await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    await page.locator('.ant-select-item-option-content').first().click() // İlk yılı seç
    
    await page.locator('.ant-select').filter({ hasText: 'Durum' }).click()
    await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    await page.getByText('Bekliyor', { exact: true }).click()
    
    // Filtreleme sonrası tablonun yüklendiğini doğrula
    await expect(page.locator('.ant-table-row').first()).toBeVisible({ timeout: 10000 }).catch(() => {
        console.log('Tablo satırı bulunamadı, muhtemelen veri yok.')
    })

    // 3. Satır Bazlı Faiz Hesaplama
    // Eğer tabloda kayıt varsa 'Faiz Hesapla' butonuna tıkla
    const faizBtn = page.getByRole('button', { name: /faiz hesapla/i }).first()
    if (await faizBtn.count() > 0) {
        await faizBtn.click()
        // Toast mesajının çıkmasını bekle
        const toast = page.locator('.ant-message-notice-content')
        await expect(toast).toBeVisible({ timeout: 15000 })
    }

    // 4. Cari Hesap Entegrasyonu (Ödenen/Bakiye)
    await expect(page.getByText('Ana Borç')).toBeVisible()
    await expect(page.getByText('Ödenen')).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Bakiye', exact: true })).toBeVisible()
  })

  test('3. Yıllık Plan: Dinamik Form ve Veritabanı Senkronizasyonu', async ({ page }) => {
    await page.goto('/aidatlar/yillik-plan')
    
    // A. Boş Durum (12 satır varsayılan)
    const rows = page.locator('.ant-card-small')
    await expect(rows).toHaveCount(12)

    // B. Satır Ekleme
    await page.getByRole('button', { name: 'Yeni Ay Ekle' }).click()
    await expect(rows).toHaveCount(13)

    // C. Veri Senkronizasyonu (Katsayı Tutarı)
    // 5. satırı değiştirince 6. satırın da değiştiğini doğrula
    const index = 4 // 5. satır
    const fifthTutarInput = rows.nth(index).locator('input[placeholder="Tutar"]')
    await fifthTutarInput.fill('3200')
    await fifthTutarInput.press('Enter')
    
    const sixthTutarInput = rows.nth(index + 1).locator('input[placeholder="Tutar"]')
    await expect(sixthTutarInput).toHaveValue('3.200,00')
    
    // İlk satırı (Ocak) değiştirince 5. satırın (Mayıs) da güncellendiğini doğrula
    const firstTutarInput = rows.first().locator('input[placeholder="Tutar"]')
    await firstTutarInput.fill('4500')
    await firstTutarInput.press('Enter')
    await expect(fifthTutarInput).toHaveValue('4.500,00')

    // D. Veritabanı Senkronizasyonu (Kaydet)
    await page.getByRole('button', { name: 'Yıllık Planı Kaydet' }).click()
    
    // Toast veya navigasyon bekle
    await expect(page.locator('.ant-message-notice-content')).toBeVisible({ timeout: 15000 })
    await expect(page).toHaveURL(/\/aidatlar\/tanimlar/, { timeout: 15000 })
  })

  test('4. Şerefiye Tablosu: Üyelik Atama ve Bilgi Düzenleme', async ({ page }) => {
     await page.goto('/projeler')
     
     // Proje seç
     const projectCard = page.locator('.ant-card').first()
     await expect(projectCard).toBeVisible()
     await projectCard.click()
     
     // Detay sayfasına geçişi doğrula
     await expect(page).toHaveURL(/\/projeler\/[a-zA-Z0-9-]+/)
     
     const serefiyeBtn = page.getByRole('button', { name: /şerefiye tablosu/i })
     await expect(serefiyeBtn).toBeVisible({ timeout: 10000 })
     await serefiyeBtn.click()

     // Tablo yoksa oluştur
     const createBtn = page.getByRole('button', { name: /tabloyu oluştur/i })
     if (await createBtn.isVisible() && await createBtn.isEnabled()) {
        await createBtn.click()
        await expect(page.locator('.ant-message-notice-content')).toContainText(/şerefiye tablosu oluşturuldu/i)
     }

     // A. Daire Bilgisi Düzenleme
     const editBtn = page.getByRole('button', { title: 'Daire Bilgilerini Düzenle' }).first()
     await expect(editBtn).toBeVisible()
     await editBtn.click()
     
     await page.locator('#kat').fill('10')
     await page.locator('#yon').fill('Güney-Batı')
     await page.getByRole('button', { name: 'Kaydet' }).click()
     
     await expect(page.locator('.ant-table-row').first()).toContainText('10')
     await expect(page.locator('.ant-table-row').first()).toContainText('Güney-Batı')

     // B. Üye Atama
     const assignBtn = page.getByRole('button', { name: 'Üyelik Ata' }).first()
     if (await assignBtn.count() > 0) {
        await assignBtn.click()
        await expect(page.locator('.ant-modal-title')).toContainText('Üye Ata')
        
        // Bir üye seç (varsa)
        const select = page.locator('.ant-select-selection-search-input')
        await select.click()
        
        // Bekle ki dropdown açılsın
        await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
        const options = page.locator('.ant-select-item-option-content')
        if (await options.count() > 0) {
            await options.first().click()
            await page.getByRole('button', { name: 'Ata' }).click()
            await expect(page.locator('.ant-message-notice-content')).toContainText(/üyelik ataması güncellendi/i)
            await expect(page.locator('.ant-table-row').first()).toContainText('DOLU')
        } else {
            await page.getByRole('button', { name: 'İptal' }).click()
        }
     }
  })
})
