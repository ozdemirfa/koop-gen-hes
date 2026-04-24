import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'

export const cariHesapService = {
  async list(query: Record<string, any>) {
    let q = supabaseAdmin
      .from('cari_hareketler')
      .select('*, cari_hesaplar(cari_adi, cari_turu, uye_id, firma_id)')

    const proje_id = Array.isArray(query.proje_id) ? query.proje_id[0] : query.proje_id
    const cari_hesap_id = Array.isArray(query.cari_hesap_id) ? query.cari_hesap_id[0] : query.cari_hesap_id
    const cari_turu = Array.isArray(query.cari_turu) ? query.cari_turu[0] : query.cari_turu
    const islem_turu = Array.isArray(query.islem_turu) ? query.islem_turu[0] : query.islem_turu

    if (proje_id) q = q.eq('proje_id', proje_id)
    if (cari_hesap_id) q = q.eq('cari_hesap_id', cari_hesap_id)
    if (cari_turu) q = q.eq('cari_hesaplar.cari_turu', cari_turu)
    if (islem_turu) q = q.eq('islem_turu', islem_turu)
    if (query.baslangic_tarihi) q = q.gte('tarih', query.baslangic_tarihi)
    if (query.bitis_tarihi) q = q.lte('tarih', query.bitis_tarihi)

    // Eşleşmemiş cari hareketleri: banka_hareketleri.eslesen_cari_hareket_id ile referanslanmayanlar
    if (query.eslesmemis === 'true' || query.eslesmemis === true) {
      const { data: eslesenler, error: eslesError } = await supabaseAdmin
        .from('banka_hareketleri')
        .select('eslesen_cari_hareket_id')
        .not('eslesen_cari_hareket_id', 'is', null)

      if (eslesError) throw eslesError

      const eslesenIds = (eslesenler || [])
        .map(r => r.eslesen_cari_hareket_id)
        .filter(Boolean) as string[]

      if (eslesenIds.length > 0) {
        q = q.not('id', 'in', `(${eslesenIds.join(',')})`)
      }
    }

    const { data, error } = await q.order('tarih', { ascending: true })
    if (error) throw error
    return data
  },

  async listAccounts(query: Record<string, any>) {
    let q = supabaseAdmin
      .from('cari_hesaplar')
      .select('*')

    const proje_id = Array.isArray(query.proje_id) ? query.proje_id[0] : query.proje_id
    const cari_turu = Array.isArray(query.cari_turu) ? query.cari_turu[0] : query.cari_turu

    if (proje_id) q = q.eq('proje_id', proje_id)
    if (cari_turu) q = q.eq('cari_turu', cari_turu)

    const { data, error } = await q.order('cari_adi', { ascending: true })
    if (error) throw error
    return data
  },

  async create(body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('cari_hareketler')
      .insert([body])
      .select()
      .single()

    if (error) throw error
    return data
  },

  async createPayment(paymentData: {
    proje_id: string,
    cari_hesap_id: string,
    islem_turu: 'gelen_odeme' | 'giden_odeme',
    odeme_turu: 'nakit' | 'banka' | 'cek' | 'kredi_karti',
    tutar: number,
    tarih: string,
    aciklama?: string,
    belge_no?: string,
    banka_hesap_id?: string,
    cek_id?: string,
    vade_tarihi?: string,
    banka?: string,
    sube?: string,
    kaynak_tipi?: string,
    kaynak_id?: string
  }) {
    const { 
      islem_turu, 
      tutar, 
      odeme_turu, 
      banka_hesap_id, 
      cek_id, 
      vade_tarihi,
      banka,
      sube,
      ...rest 
    } = paymentData;

    // 1. Çek Entegrasyonu Özel Durumu
    if (odeme_turu === 'cek') {
      let finalCekId = cek_id;
      
      if (!finalCekId) {
        // Cari hesaptan firma_id'yi bul (Cekler tablosunda firma_id zorunludur)
        const { data: cari } = await supabaseAdmin
          .from('cari_hesaplar')
          .select('firma_id')
          .eq('id', rest.cari_hesap_id)
          .single();

        if (!cari?.firma_id) {
          throw new ApiError(400, 'Çek kaydı için geçerli bir firma cari hesabı gereklidir.');
        }

        const { data: newCek, error: cekError } = await supabaseAdmin
          .from('cekler')
          .insert([{
            proje_id: rest.proje_id,
            firma_id: cari.firma_id,
            cek_no: rest.belge_no || 'YENI-CEK',
            banka: banka || 'Belirtilmedi',
            sube: sube || '',
            tutar: tutar,
            vade_tarihi: vade_tarihi || new Date().toISOString().split('T')[0],
            durum: 'beklemede',
            aciklama: rest.aciklama
          }])
          .select()
          .single();

        if (cekError) throw cekError;
        
        // Çek ödendiğinde cari hareket atılacağı için burada cari_hareketler'e kayıt ATMIYORUZ.
        return { 
          ...newCek,
          is_cek: true,
          message: 'Çek kaydı oluşturuldu. Cari hareket çek ödendiğinde oluşacaktır.' 
        };
      } else {
        // Zaten cek_id gelmişse (mevcut bir çek seçilmişse)
        return { id: finalCekId, message: 'Mevcut çek ilişkilendirildi.' };
      }
    }

    // --- Normal İşleyiş (Nakit, Banka, Kredi Kartı) ---
    let borc = 0;
    let alacak = 0;

    if (islem_turu === 'gelen_odeme') {
      borc = tutar;
    } else {
      alacak = tutar;
    }

    // 2. Cari Hareketi Oluştur
    const { data: hareket, error: hareketError } = await supabaseAdmin
      .from('cari_hareketler')
      .insert([{
        ...rest,
        islem_turu,
        odeme_turu,
        borc,
        alacak,
        banka_hesap_id
      }])
      .select()
      .single();

    if (hareketError) throw hareketError;

    // 3. Banka Hareketi Entegrasyonu
    if (odeme_turu === 'banka' && banka_hesap_id) {
      const { error: bankaError } = await supabaseAdmin
        .from('banka_hareketleri')
        .insert([{
          banka_hesap_id,
          tarih: rest.tarih,
          tutar: tutar,
          islem_tipi: islem_turu === 'gelen_odeme' ? 'gelir' : 'gider',
          aciklama: rest.aciklama,
          eslesen_cari_hareket_id: hareket.id,
          eslesti: true
        }]);

      if (bankaError) throw bankaError;
    }

    return hareket;
  }
}
