import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { requireProjeId } from '../utils/projectGuard'
import logger from '../utils/logger'

export const bankaHesapService = {
  async listHesaplar(query: Record<string, any> = {}) {
    // proje_id zorunlu — service-role RLS bypass ettiğinden filtre olmadan tüm
    // projelerin banka hesabı sızar. Route middleware aynı kontrolü yapıyor;
    // burası defense in depth.
    const projeId = requireProjeId(query.proje_id)

    // Sprint 20260520-perf / PR2: N+1 fix.
    // Önceki versiyon her hesap için ayrı `banka_hareketleri` SELECT atıyordu
    // (Promise.all içinde N+1). Tek RPC ile DB tarafında GROUP BY + SUM yapılır.
    // RPC: `fn_banka_hesaplari_with_bakiye(p_proje_id UUID)` →
    //      `id, proje_id, banka_adi, ..., bakiye` (tek round-trip).
    const { data, error } = await supabaseAdmin.rpc('fn_banka_hesaplari_with_bakiye', {
      p_proje_id: projeId,
    })

    if (error) {
      logger.error('fn_banka_hesaplari_with_bakiye RPC hatası', { error, projeId })
      throw error
    }

    // RPC NUMERIC bakiye döndürüyor → JS Number'a çevirelim (frontend Number bekliyor).
    return (data ?? []).map((row: any) => ({
      ...row,
      bakiye: Number(row.bakiye ?? 0),
    }))
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

  // IDOR fix (security-quality-sprint, 2026-05-26):
  //   updateHesap zorunlu projeId parametresi + .eq('proje_id', projeId).
  //   body içindeki proje_id silinir (mass-assignment: caller hesabı başka
  //   projeye taşıyamaz).
  async updateHesap(id: string, body: Record<string, any>, projeId: string) {
    const safeProjeId = requireProjeId(projeId)

    const sanitized = { ...body }
    delete sanitized.proje_id
    delete sanitized.projeId

    const { data, error } = await supabaseAdmin
      .from('banka_hesaplari')
      .update(sanitized)
      .eq('id', id)
      .eq('proje_id', safeProjeId)
      .select()
      .maybeSingle()

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
    const projeId = requireProjeId(query.proje_id)

    let q = supabaseAdmin
      .from('banka_hareketleri')
      .select('*, banka_hesaplari!inner(banka_adi, proje_id), cari_hareketler!banka_hareket_id(islem_turu, cari_hesaplar(cari_turu, cari_adi))')
      .eq('banka_hesaplari.proje_id', projeId)

    if (query.banka_hesap_id) {
      q = q.eq('banka_hesap_id', query.banka_hesap_id)
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

  // IDOR fix (security-quality-sprint, 2026-05-26):
  //   esle zorunlu projeId + iki kademe pre-check:
  //   1. banka_hareketleri.id'nin parent hesabının proje_id'si caller projesi mi?
  //   2. cariHareketId proje_id eşleşmesi (cross-project eşleştirme yasak).
  async esle(id: string, cariHareketId: string, projeId: string) {
    const safeProjeId = requireProjeId(projeId)

    // Banka hareketinin parent hesabı caller projesinde mi?
    const { data: bankaHareket, error: bhErr } = await supabaseAdmin
      .from('banka_hareketleri')
      .select('id, banka_hesaplari!inner(proje_id)')
      .eq('id', id)
      .maybeSingle()
    if (bhErr) throw bhErr
    const bhProjeId = (bankaHareket as any)?.banka_hesaplari?.proje_id
    if (!bankaHareket || bhProjeId !== safeProjeId) {
      throw ApiError.notFound('Banka hareketi bulunamadı')
    }

    // Cari hareket de aynı projede mi?
    const { data: cariHareket, error: chErr } = await supabaseAdmin
      .from('cari_hareketler')
      .select('id')
      .eq('id', cariHareketId)
      .eq('proje_id', safeProjeId)
      .maybeSingle()
    if (chErr) throw chErr
    if (!cariHareket) throw ApiError.notFound('Cari hareket bulunamadı')

    const { data, error } = await supabaseAdmin
      .from('banka_hareketleri')
      .update({ eslesen_cari_hareket_id: cariHareketId, eslesti: true })
      .eq('id', id)
      .select()
      .maybeSingle()

    if (error) throw error
    if (!data) throw ApiError.notFound('Banka hareketi bulunamadı')
    return data
  }
}
