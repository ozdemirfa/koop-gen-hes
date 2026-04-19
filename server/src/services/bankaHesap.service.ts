import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'

export const bankaHesapService = {
  async listHesaplar(query: Record<string, any> = {}) {
    let q = supabaseAdmin
      .from('banka_hesaplari')
      .select('*')

    if (query.proje_id) q = q.eq('proje_id', query.proje_id)

    const { data, error } = await q.order('banka_adi')

    if (error) throw error
    return data
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
    let q = supabaseAdmin
      .from('banka_hareketleri')
      .select('*, banka_hesaplari(banka_adi), cari_hareketler!banka_hareket_id(firmalar(unvan))')

    // Eğer banka_hesap_id varsa proje_id filtresine gerek yok, hatta proje_id null ise sorun çıkarabilir
    if (query.banka_hesap_id) {
      q = q.eq('banka_hesap_id', query.banka_hesap_id)
    } else if (query.proje_id) {
      q = q.eq('proje_id', query.proje_id)
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
      // islem_tipi: 'gelir' (bize para geliyor) -> cari hareket: 'borc' (firmaya borç yazarız/bizden mal aldı gibi)
      // islem_tipi: 'gider' (bizden para çıkıyor) -> cari hareket: 'alacak' (firma bizden alacağını tahsil etti/ödeme yaptık)
      const hareket_tipi = body.islem_tipi === 'gelir' ? 'borc' : 'alacak';
      
      const cariBody = {
        firma_id: body.firma_id,
        proje_id: body.proje_id,
        tarih: body.tarih,
        tutar: body.tutar,
        hareket_tipi,
        odeme_yontemi: body.odeme_yontemi || 'banka',
        aciklama: body.aciklama,
        banka_hareket_id: hareket.id
      }

      const { error: cariError } = await supabaseAdmin
        .from('cari_hareketler')
        .insert([cariBody])

      if (cariError) {
        console.error('Cari hareket oluşturulurken hata:', cariError)
        // Banka hareketi silinmesin ama hata loglansın. 
        // İstenirse rollback mekanizması eklenebilir.
      } else {
        // Cari hareket oluşturulduysa banka hareketini 'eslesti' olarak işaretle
        await supabaseAdmin
          .from('banka_hareketleri')
          .update({ eslesti: true })
          .eq('id', hareket.id)
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
