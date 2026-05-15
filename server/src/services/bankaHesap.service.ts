import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import logger from '../utils/logger'

export const bankaHesapService = {
  async listHesaplar(query: Record<string, any> = {}) {
    let q = supabaseAdmin
      .from('banka_hesaplari')
      .select('*')

    if (query.proje_id) q = q.eq('proje_id', query.proje_id)

    const { data, error } = await q.order('banka_adi')

    if (error) throw error

    // Bakiyeleri hesapla
    const updatedData = await Promise.all((data || []).map(async (hesap) => {
      let bakiye = 0
      try {
        const { data: hareketler, error: hError } = await supabaseAdmin
          .from('banka_hareketleri')
          .select('tutar, islem_tipi')
          .eq('banka_hesap_id', hesap.id)
        
        if (hError) throw hError

        hareketler?.forEach(h => {
          const tutar = Number(h.tutar || 0)
          if (h.islem_tipi === 'gelir') {
            bakiye += tutar
          } else if (h.islem_tipi === 'gider') {
            bakiye -= tutar
          }
        })
      } catch (err) {
        logger.error('Bakiye hesaplama hatası', { err, hesapId: hesap.id })
      }
      return { ...hesap, bakiye }
    }))

    return updatedData
  },

  async createHesap(body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('banka_hesaplari')
      .insert([body])
      .select()
      .single()

    if (error) throw error
    return data
  },

  async updateHesap(id: string, body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('banka_hesaplari')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    if (!data) throw ApiError.notFound('Banka hesabı bulunamadı')
    return data
  },

  async listHareketler(query: Record<string, any>) {
    // 20260421000001_cari_hesap_revizyon_faz1.sql cari_hareketler.firma_id'yi drop edip
    // cari_hesap_id'ye çevirdi. cari_hesaplar tablosunda cari_turu ('uye'|'firma') ve
    // cari_adi (insan tarafından okunabilir isim) zaten tutuluyor — frontend "İlgili Cari"
    // etiketinde "Firma - <ad>" / "Üye - <ad>" prefix'i için bu iki kolon yeterli; ek
    // firmalar/uyeler tablo join'ine gerek yok.
    let q = supabaseAdmin
      .from('banka_hareketleri')
      .select('*, banka_hesaplari!inner(banka_adi, proje_id), cari_hareketler!banka_hareket_id(cari_hesaplar(cari_turu, cari_adi))')

    // Filtreleme: banka_hesap_id varsa ona göre, yoksa proje_id varsa banka_hesaplari üzerinden filtrele
    if (query.banka_hesap_id) {
      q = q.eq('banka_hesap_id', query.banka_hesap_id)
    } else if (query.proje_id) {
      q = q.eq('banka_hesaplari.proje_id', query.proje_id)
    }

    if (query.eslesti !== undefined) q = q.eq('eslesti', query.eslesti === 'true')

    const { data, error } = await q.order('tarih', { ascending: false })
    if (error) throw error
    return data
  },

  async createHareket(body: Record<string, any>) {
    // 1. Banka hareketini oluştur
    const { data: hareket, error } = await supabaseAdmin
      .from('banka_hareketleri')
      .insert([body])
      .select()
      .single()

    if (error) throw error

    // 2. Eğer firma_id varsa cari hareket de oluştur
    if (body.firma_id && hareket) {
      // Proje Perspektifinde: Gelir/Tahsilat = BORC (projenin borcu artıyor), Gider/Ödeme = ALACAK (projenin alacağı artıyor/borcu kapanıyor)
      const borc = body.islem_tipi === 'gelir' ? body.tutar : 0;
      const alacak = body.islem_tipi === 'gider' ? body.tutar : 0;
      
      // Cari hesabı bul
      const { data: cari } = await supabaseAdmin
        .from('cari_hesaplar')
        .select('id')
        .eq('proje_id', body.proje_id)
        .eq('firma_id', body.firma_id)
        .single()

      if (cari) {
        const cariBody = {
          cari_hesap_id: cari.id,
          proje_id: body.proje_id,
          islem_turu: body.islem_tipi === 'gelir' ? 'gelen_odeme' : 'giden_odeme',
          tarih: body.tarih,
          borc,
          alacak,
          odeme_turu: body.odeme_yontemi || 'banka',
          aciklama: body.aciklama,
          banka_hareket_id: hareket.id
        }

        const { error: cariError } = await supabaseAdmin
          .from('cari_hareketler')
          .insert([cariBody])

        if (cariError) {
          logger.error('Cari hareket oluşturulurken hata', { cariError, bankaHareketId: hareket.id })
          // Banka hareketi silinmesin ama hata loglansın. İstenirse rollback eklenebilir.
        } else {
          // Cari hareket oluşturulduysa banka hareketini 'eslesti' olarak işaretle
          await supabaseAdmin
            .from('banka_hareketleri')
            .update({ eslesti: true })
            .eq('id', hareket.id)
        }
      }
    }

    return hareket
  },

  async esle(id: string, cariHareketId: string) {
    const { data, error } = await supabaseAdmin
      .from('banka_hareketleri')
      .update({ eslesen_cari_hareket_id: cariHareketId, eslesti: true })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    if (!data) throw ApiError.notFound('Banka hareketi bulunamadı')
    return data
  }
}
