import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import logger from '../utils/logger'

export const cariHesapService = {
  async list(query: Record<string, any>) {
    const projeId = Array.isArray(query.proje_id) ? query.proje_id[0] : query.proje_id

    // Eşleşmemiş filtresi anti-join gerektirdiğinden RPC'ye delege ediyoruz.
    // PostgREST URL'sine UUID listesi gömme yaklaşımı hem güvenlik hem URL limit
    // açısından sakıncalıydı.
    if (query.eslesmemis === 'true' || query.eslesmemis === true) {
      if (!projeId) throw ApiError.badRequest('proje_id zorunludur')

      const { data, error } = await supabaseAdmin.rpc('fn_list_unmatched_cari_hareketler', {
        p_filters: {
          proje_id: projeId,
          uye_id: query.uye_id ?? null,
          firma_id: query.firma_id ?? null,
          cari_turu: query.cari_turu ?? null,
          islem_turu: query.islem_turu ?? null,
          baslangic_tarihi: query.baslangic_tarihi ?? null,
          bitis_tarihi: query.bitis_tarihi ?? null,
        }
      })
      if (error) throw error
      return data ?? []
    }

    const needsInner = !!(query.uye_id || query.firma_id || query.cari_turu);
    const selectStr = needsInner
      ? '*, cari_hesaplar!inner(cari_adi, cari_turu, uye_id, firma_id, proje_id)'
      : '*, cari_hesaplar(cari_adi, cari_turu, uye_id, firma_id, proje_id)';

    let q = supabaseAdmin
      .from('cari_hareketler')
      .select(selectStr)

    if (projeId) q = q.eq('proje_id', projeId)

    if (query.uye_id) q = q.eq('cari_hesaplar.uye_id', query.uye_id)
    if (query.firma_id) q = q.eq('cari_hesaplar.firma_id', query.firma_id)
    if (query.cari_turu) q = q.eq('cari_hesaplar.cari_turu', query.cari_turu)

    if (query.islem_turu) q = q.eq('islem_turu', query.islem_turu)
    if (query.baslangic_tarihi) q = q.gte('tarih', query.baslangic_tarihi)
    if (query.bitis_tarihi) q = q.lte('tarih', query.bitis_tarihi)

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
    const { data: hareket, error: hareketError } = await supabaseAdmin.rpc('fn_create_payment_atomic', {
      p_payment_data: {
        ...rest,
        islem_turu,
        odeme_turu,
        tutar,
        banka_hesap_id
      }
    });

    if (hareketError) throw hareketError;

    return hareket;
  },

  async undoClosure(id: string) {
    const { data, error } = await supabaseAdmin.rpc('fn_undo_payment_match', {
      p_movement_id: id
    });

    if (error) throw error;
    if (data && data.success === false) {
      throw new ApiError(400, data.message);
    }

    return data;
  },

  async undoHakedisClosure(id: string) {
    const { data, error } = await supabaseAdmin.rpc('fn_undo_hakedis_closure', {
      p_hakedis_id: id
    });

    if (error) throw error;
    if (data && data.success === false) {
      throw new ApiError(400, data.message);
    }

    return data;
  },

  async performFifoClosure(projeId: string) {
    try {
      const { data, error } = await supabaseAdmin.rpc('fn_match_project_payments_fifo', {
        p_proje_id: projeId
      });

      if (error) {
        logger.error('fn_match_project_payments_fifo RPC error', { error, projeId });
        throw error;
      }

      return {
        success: true,
        message: 'Hesap kapamaları tamamlandı.',
        details: data
      };
    } catch (err) {
      logger.error('FIFO Closure exception', { err, projeId });
      throw err;
    }
  }
}
