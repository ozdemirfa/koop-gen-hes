import { test, expect } from '@playwright/test'
import { login, uniqueSuffix } from './helpers'

test.describe('Kapsamlı Test Revizyon 4 - QA Denetimi', () => {
  let projectName: string
  let suffix: string

  test.beforeEach(async ({ page }) => {
    test.setTimeout(180000)
    await login(page)
    suffix = uniqueSuffix()
    projectName = `Proje R4 ${suffix}`
  })

  test('1. Dashboard: 15 Kartlık Yapı ve Pano Doğrulaması', async ({ page }) => {
    await page.goto('/')
    
    // Proje seçiliyse veya bir proje seçerek başla
    const projectSelect = page.locator('.ant-select-selection-item').first()
    if (await projectSelect.count() === 0 || (await projectSelect.textContent() === 'Proje Seçilmedi')) {
       // Proje listesine git ve varsa ilkini seç
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
          await expect(page.locator('[data-testid="card-title"]').filter({ hasText: projectName })).toBeVisible()
          await page.getByText(projectName).first().click()
          await page.goto('/')
       }
    }

    // Header başlığı 'Pano' olmalı
    await expect(page.locator('#header-left')).toContainText('Pano')

    // Toplam 15 kart olmalı (5 satır * 3 sütun)
    const statCards = page.locator('.ant-statistic')
    await expect(statCards).toHaveCount(15)

    // Önemli bazı kartların varlığını doğrula
    const requiredTitles = [
      'Proje Süresi', 'Aktif Üye Sayısı', 'Toplam Daire Sayısı',
      'Toplam Tahsilat', 'Geciken Aidatlar', 'Gecikme Faiz Tahsilatı',
      'Tahakkuk Eden Gider', 'Faturalar', 'Fatura Farkı',
      'Toplam Cari Ödeme', 'Birikmiş Teminatlar', 'Cari Bakiye',
      'Bankalar Bakiye Toplamı', 'Çekler', 'Ödemeler Sonrası Nakit'
    ]

    for (const title of requiredTitles) {
      await expect(page.getByText(title)).toBeVisible()
    }
  })

  test('2. Aidat Yönetimi: Yan Menü, Filtreler ve Cari Entegrasyon', async ({ page }) => {
    await page.goto('/')
    
    // Yan menü navigasyonu
    await page.locator('.ant-menu-submenu-title').filter({ hasText: 'Aidat Yönetimi' }).click()
    await page.getByRole('menuitem', { name: 'Aidat Listesi' }).click()
    await expect(page.locator('#header-left')).toContainText('Aidat Listesi')

    // Filtreler
    await expect(page.locator('.ant-select').filter({ hasText: 'Yıl' })).toBeVisible()
    await expect(page.locator('.ant-select').filter({ hasText: 'Ay' })).toBeVisible()
    await expect(page.locator('.ant-select').filter({ hasText: 'Durum' })).toBeVisible()
    await expect(page.locator('.ant-select').filter({ hasText: 'Blok' })).toBeVisible()
    await expect(page.locator('.ant-select').filter({ hasText: 'Daire' })).toBeVisible()

    // Cari Entegrasyon Kontrolü (Ödenen ve Bakiye kolonları)
    await expect(page.getByText('Ana Borç')).toBeVisible()
    await expect(page.getByText('Ödenen')).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Bakiye', exact: true })).toBeVisible()
  })

  test('3. Yıllık Plan: Form Dinamiği ve Senkronizasyon', async ({ page }) => {
    await page.goto('/aidatlar/yillik-plan')
    await expect(page.locator('#header-left')).toContainText('Yeni Yıllık Aidat Planı')

    // A. Boş Durum (12 satır varsayılan)
    const rows = page.locator('.ant-card-small')
    await expect(rows).toHaveCount(12)

    // B. Satır Ekleme/Silme
    await page.getByRole('button', { name: 'Yeni Ay Ekle' }).click()
    await expect(rows).toHaveCount(13)
    await rows.last().getByRole('button', { name: 'Sil' }).click()
    await expect(rows).toHaveCount(12)
    
    // C. Veri Senkronizasyonu (Katsayı Tutarı Değişimi)
    const firstTutar = rows.first().locator('input[placeholder="Tutar"]')
    await firstTutar.fill('2500')
    await firstTutar.press('Enter')
    
    // İkinci satırın da 2500 olduğunu doğrula (Normal aidat ise)
    const secondTutar = rows.nth(1).locator('input[placeholder="Tutar"]')
    await expect(secondTutar).toHaveValue('2.500,00')

    // D. Gecikme Oranı Senkronizasyonu
    const firstFaiz = rows.first().locator('input[placeholder="%"]')
    await firstFaiz.fill('3,5')
    await firstFaiz.press('Enter')
    const secondFaiz = rows.nth(1).locator('input[placeholder="%"]')
    await expect(secondFaiz).toHaveValue('3,5')
  })

  test('4. Şerefiye Tablosu: Üye Atama ve Daire Bilgisi Düzenleme', async ({ page }) => {
     await page.goto('/projeler')
     
     // Test projesini bul veya oluştur
     let projectCard = page.locator('[data-testid="card-title"]').filter({ hasText: projectName })
     if (await projectCard.count() === 0) {
        await page.getByRole('button', { name: /yeni proje/i }).click()
        await page.locator('#proje_adi').fill(projectName)
        await page.locator('input[placeholder="Örn: A"]').fill('A')
        await page.locator('#bloklar_0_toplam_daire').fill('3')
        await page.getByRole('button', { name: 'Kaydet' }).click()
        await expect(page.locator('[data-testid="card-title"]').filter({ hasText: projectName })).toBeVisible()
        projectCard = page.locator('[data-testid="card-title"]').filter({ hasText: projectName })
     }
     
     await projectCard.first().click()
     await page.getByRole('button', { name: /şerefiye tablosu/i }).click()

     // Tabloyu oluştur (eğer boşsa)
     const createBtn = page.getByRole('button', { name: /tabloyu oluştur/i })
     if (await createBtn.isVisible() && await createBtn.isEnabled()) {
        await createBtn.click()
        await expect(page.getByText(/şerefiye tablosu oluşturuldu/i)).toBeVisible()
     }

     // A. Daire Bilgisi Düzenleme Modalı
     await page.getByRole('button', { title: 'Daire Bilgilerini Düzenle' }).first().click()
     await expect(page.getByText('Daire Bilgileri')).toBeVisible()
     
     await page.locator('#kat').fill('3')
     await page.locator('#yon').fill('Doğu')
     await page.locator('#m2').fill('120')
     await page.locator('#oda_sayisi').fill('3+1')
     await page.locator('#serefiye_orani').fill('1,5')
     
     await page.getByRole('button', { name: 'Kaydet' }).click()
     
     // Tabloda güncellendiğini doğrula
     await expect(page.locator('tr.ant-table-row').first()).toContainText('3')
     await expect(page.locator('tr.ant-table-row').first()).toContainText('Doğu')
     await expect(page.locator('tr.ant-table-row').first()).toContainText('120,00 m²')
     await expect(page.locator('tr.ant-table-row').first()).toContainText('3+1')

     // B. Üye Atama Modalı
     await page.getByRole('button', { name: 'Üyelik Ata' }).first().click()
     await expect(page.locator('.ant-modal-title')).toContainText('Üye Ata')
     await expect(page.getByText('Üye Seçin')).toBeVisible()
     await page.getByRole('button', { name: 'İptal' }).click()
  })
})
