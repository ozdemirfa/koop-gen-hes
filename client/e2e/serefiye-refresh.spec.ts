import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Serefiye Tabloyu Yenile Akışı', () => {
  test('P3 - Tabloyu Yenile butonu onay penceresi açmalı ve işlemi yapmalı', async ({ page }) => {
    // Önce temiz bir state ile başla
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    
    await login(page);
    // Önce projeleri çekip ilk projeyi bulalım
    await page.goto('/projeler');
    await page.waitForSelector('[data-testid^="project-card-"]');
    
    // İlk kartın ID'sini bul (data-testid'den)
    const card = page.locator('[data-testid^="project-card-"]').first();
    const testId = await card.getAttribute('data-testid');
    const projectId = testId?.replace('project-card-', '');

    if (!projectId) throw new Error('Proje bulunamadı');

    // Doğrudan Şerefiye sayfasına git
    await page.goto(`/projeler/${projectId}/serefiye`);
    
    // 1. Sayfanın yüklendiğini doğrula
    await expect(page).toHaveURL(new RegExp(`/projeler/${projectId}/serefiye`));
    await page.waitForSelector('.ant-table', { timeout: 15000 });
    
    // 2. Butonların yüklenmesini bekle (usePageSettings gecikmeli olabilir)
    const refreshBtn = page.getByTestId('refresh-serefiye-btn');
    const generateBtn = page.getByTestId('generate-serefiye-btn');

    // Herhangi birinin görünür olmasını bekle
    await expect(async () => {
      const isVisible = await refreshBtn.isVisible() || await generateBtn.isVisible();
      expect(isVisible).toBeTruthy();
    }).toPass();
    
    // Eğer tablo doluysa "Tabloyu Yenile" testi yap
    if (await refreshBtn.isVisible()) {
      console.log('Tablo dolu, "Tabloyu Yenile" butonuna tıklanıyor...');
      
      // API çağrısını dinle (modal onayından sonra tetiklenecek)
      const responsePromise = page.waitForResponse(response => 
        response.url().includes('reset-serefiye') && response.request().method() === 'POST'
      , { timeout: 30000 }).catch(() => null);

      await refreshBtn.click({ force: true });
      console.log('Butona tıklandı, modal bekleniyor...');

      // 3. Onay modalının açıldığını doğrula
      const modal = page.locator('.ant-modal-confirm'); // Modal.confirm use this class
      try {
        await expect(modal).toBeVisible({ timeout: 10000 });
        console.log('Modal görünür oldu.');
      } catch (e) {
        console.log('Modal görünmedi. Sayfa içeriği:', await page.content());
        throw e;
      }
      await expect(modal).toContainText('Tabloyu Yenile');
      
      // 4. "Evet, Yenile" butonuna tıkla
      await modal.getByRole('button', { name: /Evet, Yenile/i }).click();

      // Yanıtı bekle ve kontrol et
      const response = await responsePromise;
      if (response.status() === 404) {
        throw new Error(`API 404 hatası verdi: ${response.url()}`);
      }
      expect(response.status()).toBe(200);

      // 5. Başarı mesajını bekle
      await expect(page.locator('.ant-message-success')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('.ant-message-success')).toContainText('Şerefiye tablosu yenilendi');

      // 6. Tablonun hala veri içerdiğini doğrula
      const rows = page.locator('.ant-table-row');
      await expect(rows.first()).toBeVisible();
    } else {
      console.log('Tablo boş, "Tabloyu Oluştur" testi yapılıyor.');
      await generateBtn.click();
      await expect(page.locator('.ant-message-success')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('.ant-message-success')).toContainText('oluşturuldu');
    }
  });
});
