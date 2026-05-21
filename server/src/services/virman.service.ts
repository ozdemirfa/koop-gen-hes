import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { requireProjeId } from '../utils/projectGuard'
import logger from '../utils/logger'

// Sprint 20260520-virman-feature:
// Virman (banka↔banka, banka↔nakit, nakit↔banka transfer) servisi.
// Create atomic — `fn_create_virman_atomic` RPC ile virman + 2 banka_hareketleri
// kaydı tek transaction'da oluşur. Delete CASCADE — banka_hareketleri.virman_id
// FK ON DELETE CASCADE banka hareketlerini de siler.

// Sprint fix/virman-proje-id-rootcause-sprint: service katmanı defansif UUID
// validation. Controller'la aynı pattern; bağımsız modülde duplikasyon, ama
// servis tek başına çağrılırsa (test/integration) yine korunma sağlar.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface VirmanCreateInput {
  proje_id: string
  virman_tipi: 'banka_banka' | 'banka_nakit' | 'nakit_banka'
  kaynak_hesap_id?: string | null
  hedef_hesap_id?: string | null
  tutar: number
  tarih: string
  aciklama?: string | null
}

export const virmanService = {
  async list(query: Record<string, any>) {
    const projeId = requireProjeId(query.proje_id)

    let q = supabaseAdmin
      .from('virmanlar')
      .select(
        '*, kaynak:banka_hesaplari!virmanlar_kaynak_hesap_id_fkey(banka_adi), hedef:banka_hesaplari!virmanlar_hedef_hesap_id_fkey(banka_adi)',
      )
      .eq('proje_id', projeId)

    if (query.baslangic_tarihi) q = q.gte('tarih', query.baslangic_tarihi)
    if (query.bitis_tarihi) q = q.lte('tarih', query.bitis_tarihi)
    if (query.virman_tipi) q = q.eq('virman_tipi', query.virman_tipi)

    const { data, error } = await q.order('tarih', { ascending: false }).order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async create(input: VirmanCreateInput, actorId?: string) {
    // RPC çağrısı — atomic transaction (virman + 2 banka_hareketleri).
    // DB CHECK constraint'leri tipi/NULL kombinasyonunu zorlar; schema seviyesi de
    // erken hata verir → çift güvence.

    // Sprint fix/virman-proje-id-rootcause-sprint:
    // Service katmanında son bir defansif assertion — controller'dan geçen
    // input.proje_id'nin gerçekten dolu/uuid olduğunu doğrula. Eğer burada
    // başarısız olursa controller defansı by-pass edilmiş demektir (örn.
    // controller hâlâ eski versiyon canlı). errorHandler bu ApiError'u
    // doğru status code (400) + mesaj ile döner.
    if (typeof input.proje_id !== 'string' || !UUID_PATTERN.test(input.proje_id)) {
      logger.error('virman service create: input.proje_id invalid', {
        input_keys: Object.keys(input ?? {}),
        proje_id_type: typeof input?.proje_id,
        proje_id_value: input?.proje_id,
      })
      throw ApiError.badRequest('proje_id zorunludur (service-defans)', [
        { field: 'proje_id', message: 'Servis katmanına geçerli proje_id ulaşmadı' },
      ])
    }

    // DIAGNOSTIC: virman proje_id bug — remove after fix
    // p_data'yı local değişkene aldık ki RPC çağrısından hemen önce serileştirilecek
    // tam payload'u log'a yansıtabilelim. Controller log'uyla diff: proje_id
    // hangi katmanda kayboluyor (Zod parse vs supabase-js serialization)?
    const pData = {
      proje_id: input.proje_id,
      virman_tipi: input.virman_tipi,
      kaynak_hesap_id: input.kaynak_hesap_id ?? null,
      hedef_hesap_id: input.hedef_hesap_id ?? null,
      tutar: input.tutar,
      tarih: input.tarih,
      aciklama: input.aciklama ?? null,
    }

    // Son bir sanity-check: JSON.stringify roundtrip ile proje_id'nin gerçekten
    // serialized payload'da yer aldığını doğrula. Eğer roundtrip sonrası kayıpsa
    // supabase-js çağrısına gönderilmeden önce yakala — hipotez:
    // "supabase-js v2.102 JSONB serialization quirk" şüphesini eler.
    const serialized = JSON.stringify(pData)
    if (!serialized.includes('"proje_id"')) {
      logger.error('virman service: proje_id JSON serialization sonrası kayıp', {
        pData,
        serialized,
      })
      throw ApiError.internal('Sistem hatası — proje_id serialization (sprint diag)')
    }

    logger.info('DIAGNOSTIC virman create RPC payload', {
      p_data: pData,
      serialized_length: serialized.length,
      serialized_has_proje_id: serialized.includes('"proje_id"'),
      proje_id_type: typeof pData.proje_id,
      actor_id: actorId ?? null,
    })

    const { data, error } = await supabaseAdmin.rpc('fn_create_virman_atomic', {
      p_data: pData,
      p_actor_id: actorId ?? null,
    })

    if (error) {
      // RPC error'ı production'da "Zorunlu alan eksik: proje_id" şeklinde
      // 23502 mesajına dönüşüyor. Hata payload'unu zenginleştirelim ki
      // errorHandler debug details içine pData'yı koyabilsin (production'da
      // sadece __debug field, NODE_ENV gate'li).
      logger.error('Virman create RPC hatası', {
        error,
        error_code: (error as any)?.code,
        error_message: (error as any)?.message,
        error_column: (error as any)?.column,
        error_hint: (error as any)?.hint,
        p_data_proje_id: pData.proje_id,
        input,
      })
      throw error
    }
    return data as { virman_id: string; gider_hareket_id?: string; gelir_hareket_id?: string }
  },

  async remove(id: string, projeId: string) {
    // proje_id eşleşmesini WHERE'a koy → cross-project silmeye karşı defense in depth
    // (requireProjectAccess middleware zaten proje üyeliğini doğruluyor, ama bu
    // kayıt bu projeye ait mi sorusunu RLS bypass eden service-role için garantiler).
    const { data: existing, error: findErr } = await supabaseAdmin
      .from('virmanlar')
      .select('id, proje_id')
      .eq('id', id)
      .single()

    if (findErr || !existing) throw ApiError.notFound('Virman bulunamadı')
    if (existing.proje_id !== projeId) throw ApiError.notFound('Virman bulunamadı')

    const { error } = await supabaseAdmin.from('virmanlar').delete().eq('id', id)
    if (error) throw error
    return { id, deleted: true }
  },
}
