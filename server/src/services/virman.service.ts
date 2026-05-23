import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { requireProjeId } from '../utils/projectGuard'

// Virman (banka↔banka, banka↔nakit, nakit↔banka transfer) servisi.
// Create atomic — `fn_create_virman_atomic` RPC ile virman + 2 banka_hareketleri
// kaydı tek transaction'da oluşur. Delete CASCADE — banka_hareketleri.virman_id
// FK ON DELETE CASCADE banka hareketlerini de siler.

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
    const { data, error } = await supabaseAdmin.rpc('fn_create_virman_atomic', {
      p_data: {
        proje_id: input.proje_id,
        virman_tipi: input.virman_tipi,
        kaynak_hesap_id: input.kaynak_hesap_id ?? null,
        hedef_hesap_id: input.hedef_hesap_id ?? null,
        tutar: input.tutar,
        tarih: input.tarih,
        aciklama: input.aciklama ?? null,
      },
      p_actor_id: actorId ?? null,
    })
    if (error) throw error
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
