import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { requireProjeId } from '../utils/projectGuard'
import logger from '../utils/logger'

// TASK-BE-06 (sprint 20260511-backlog-batch1):
// islem_turu_in CSV parametresinin whitelist + slice limiti. Whitelist disinda
// bir deger gelirse atilir; uzunluk MAX_ISLEM_TURU_IN ile sinirlanir (DoS koruma).
const ISLEM_TURU_WHITELIST = new Set<string>([
  'gelen_odeme',
  'giden_odeme',
  'iade_odeme',
  'uyelik_baslangic',
  'aidat_kayit',
  'hakedis',
  'gecikme_faizi',
  'fatura',
  'odeme',
])
const MAX_ISLEM_TURU_IN = 12

// Nullable alanlar Zod schema'da `.optional().nullable()` olduğu için
// burada da `null` desteği eklendi (TASK-BE-10, sprint 20260511-backlog-batch3).
type PaymentInput = {
  proje_id: string
  cari_hesap_id: string
  islem_turu: 'gelen_odeme' | 'giden_odeme' | 'iade_odeme' | 'uyelik_baslangic'
  odeme_turu: 'nakit' | 'banka' | 'cek' | 'kredi_karti' | 'cari'
  tutar: number
  tarih: string
  aciklama?: string | null
  belge_no?: string | null
  banka_hesap_id?: string | null
  cek_id?: string | null
  vade_tarihi?: string | null
  banka?: string | null
  sube?: string | null
  kaynak_tipi?: string
  kaynak_id?: string
  // 2026-05-15 hotfix: cariPaymentSchema'da whitelist'lenmiş boolean sinyali.
  // Frontend "Teminat İadesi" checkbox state'i; service tarafında kaynak_tipi='teminat'
  // string'ine çevirilir (route handler boundary'sinde mapping; mass-assignment koruması).
  is_teminat?: boolean
  actorId?: string
}

export const cariHesapService = {
  async list(query: Record<string, any>) {
    const projeIdRaw = Array.isArray(query.proje_id) ? query.proje_id[0] : query.proje_id

    // Eşleşmemiş filtresi anti-join gerektirdiğinden RPC'ye delege ediyoruz.
    // PostgREST URL'sine UUID listesi gömme yaklaşımı hem güvenlik hem URL limit
    // açısından sakıncalıydı.
    if (query.eslesmemis === 'true' || query.eslesmemis === true) {
      const projeId = requireProjeId(projeIdRaw)

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

    // proje_id zorunludur — service-role RLS bypass ettiğinden filtre uygulanmazsa
    // tüm projelerin cari hareketleri sızar.
    const projeId = requireProjeId(projeIdRaw)

    const needsInner = !!(query.uye_id || query.firma_id || query.cari_turu);
    const selectStr = needsInner
      ? '*, cari_hesaplar!inner(cari_adi, cari_turu, uye_id, firma_id, proje_id)'
      : '*, cari_hesaplar(cari_adi, cari_turu, uye_id, firma_id, proje_id)';

    let q = supabaseAdmin
      .from('cari_hareketler')
      .select(selectStr)
      .eq('proje_id', projeId)

    if (query.uye_id) q = q.eq('cari_hesaplar.uye_id', query.uye_id)
    if (query.firma_id) q = q.eq('cari_hesaplar.firma_id', query.firma_id)
    if (query.cari_turu) q = q.eq('cari_hesaplar.cari_turu', query.cari_turu)

    if (query.islem_turu) q = q.eq('islem_turu', query.islem_turu)
    if (query.islem_turu_in) {
      // Whitelist + slice(0,N) DoS/garbage protection (TASK-BE-06).
      const types = String(query.islem_turu_in)
        .split(',')
        .map(s => s.trim())
        .filter(t => t && ISLEM_TURU_WHITELIST.has(t))
        .slice(0, MAX_ISLEM_TURU_IN)
      if (types.length > 0) q = q.in('islem_turu', types)
    }
    if (query.baslangic_tarihi) q = q.gte('tarih', query.baslangic_tarihi)
    if (query.bitis_tarihi) q = q.lte('tarih', query.bitis_tarihi)

    // Sprint 20260519-para-hareketleri-improvements / US-1:
    // `exclude_tahakkuk=true` ise "para hareketleri" görünümünden üyelik başlangıç
    // tahakkuk satırlarını (`islem_turu='uyelik_baslangic' AND alacak > 0`) dışla.
    // CariEkstrePage (muhasebe görünümü) bu param'ı yollamaz → default davranış değişmez (US-4).
    //
    // PostgREST `.or()` De Morgan negation: NOT(A AND B) = NOT A OR NOT B → satırı
    // koru eğer "islem_turu != uyelik_baslangic" VEYA "alacak null/sıfır".
    // `alacak.is.null` branch'i defansif — schema NOT NULL DEFAULT 0 olsa bile
    // beklenmedik NULL durumunda backward compat satırı korunur.
    if (query.exclude_tahakkuk === true || query.exclude_tahakkuk === 'true') {
      q = q.or('islem_turu.neq.uyelik_baslangic,alacak.is.null,alacak.eq.0')
    }

    const { data, error } = await q.order('tarih', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async listAccounts(query: Record<string, any>) {
    const proje_id_raw = Array.isArray(query.proje_id) ? query.proje_id[0] : query.proje_id
    const cari_turu = Array.isArray(query.cari_turu) ? query.cari_turu[0] : query.cari_turu

    // proje_id zorunludur — service-role RLS bypass ettiğinden filtre uygulanmazsa
    // tüm projelerin cari hesapları sızar.
    const proje_id = requireProjeId(proje_id_raw)

    // REV-PAY-04 (revize 2026-05-12): OdemeKayit dropdown'da "U-No - Ad Soyad"
    // formatı için uye_no join. PostgREST sözdizimi `<table>!<fk_column>(cols)`.
    // Önceki `uyeler:uye_id(...)` sözdizimi tablo *alias*'ı olarak yorumlanıyordu
    // (tablo adı="uyeler", alias="uye_id") — PostgREST 400 fırlatıp listAccounts'ı
    // boşaltıyordu; bu yüzden Firma Ekstre header'ında dropdown boş kalıyordu.
    let q = supabaseAdmin
      .from('cari_hesaplar')
      .select('*, uyeler!uye_id(uye_no)')
      .eq('proje_id', proje_id)

    if (cari_turu) q = q.eq('cari_turu', cari_turu)

    const { data, error } = await q.order('cari_adi', { ascending: true })
    if (error) throw error
    return data ?? []
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

  // B2 (sprint 20260511-uye-tahsilat-firma-revisions): tahsilat satırı düzenleme.
  // Sadece "açıklama, tarih, belge_no, tutar (borc/alacak)" gibi metadata alanlarına
  // izin verilir. Eşleştirme alanlarına (kaynak_tipi/kaynak_id) dokunulmaz —
  // kapatma bağı varsa kullanıcı önce A3/undo flow'unu kullanmalı.
  async update(id: string, body: Record<string, any>) {
    // Whitelist: sadece güvenli alanlar
    const allowed = ['aciklama', 'tarih', 'belge_no', 'borc', 'alacak', 'odeme_turu', 'banka_hesap_id']
    const patch: Record<string, any> = {}
    for (const k of allowed) {
      if (k in body) patch[k] = body[k]
    }

    // B3: kapatılmış (eşleşmiş) hareket düzenlenemez — tutar değişikliği
    // aidat/hakedis durumunu bozar.
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('cari_hareketler')
      .select('id, kaynak_tipi, kaynak_id')
      .eq('id', id)
      .maybeSingle()

    if (fetchErr) throw fetchErr
    if (!existing) throw ApiError.notFound('Cari hareket bulunamadı')

    if (existing.kaynak_tipi && existing.kaynak_id) {
      // Tutar değişikliği yasak; sadece açıklama/belge_no/tarih ile sınırla.
      if ('borc' in patch || 'alacak' in patch || 'odeme_turu' in patch || 'banka_hesap_id' in patch) {
        throw ApiError.conflict(
          'Bu kayıt bir aidat/hakediş ile eşleştirildiği için tutar veya ödeme yöntemi değiştirilemez. Önce hesap kapamayı geri alın.'
        )
      }
    }

    const { data, error } = await supabaseAdmin
      .from('cari_hareketler')
      .update(patch)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Sprint qa-review-bugfix-faz3 (2026-05-25, P1): tahsilat satiri sil.
  // Eski iki-step delete (banka + cari) transaction'a sarilmiyordu → tutarsizlik
  // riski. Migration 20260525120000 ile fn_delete_cari_hareket_with_banka RPC
  // tek tx icinde calistirir; kapali (kaynak_id NOT NULL) icin P0001 → 400 +
  // Turkce mesaj (errorHandler.ts:113-119); kayit yok ise P0002.
  async delete(id: string) {
    const { error } = await supabaseAdmin.rpc('fn_delete_cari_hareket_with_banka', { p_id: id })
    if (error) {
      // P0002 (notFound) → 404; P0001 zaten errorHandler tarafindan 400 yapilir
      if ((error as any).code === 'P0002') {
        throw ApiError.notFound('Cari hareket bulunamadi')
      }
      throw error
    }
    return { success: true, message: 'Tahsilat kaydi silindi.' }
  },

  // Sprint uyelik-baslangic-iptal-duzenle (2026-05-25):
  // Uyelik baslangic bedeli tahakkukunu duzenle. Migration 20260525170000
  // fn_update_uyelik_baslangic_tahakkuk tahsilat bagi varsa P0001 ile engeller;
  // semantik olarak 409 conflict (cariHesap.service.update'in `existing.kaynak_tipi`
  // guard'iyla simetrik). Yanlis tip / kayit yoksa P0002 → 404.
  async updateUyelikBaslangicTahakkuk(
    id: string,
    payload: { tutar: number; tarih: string; aciklama?: string | null },
    actorId?: string,
  ) {
    const { data, error } = await supabaseAdmin.rpc('fn_update_uyelik_baslangic_tahakkuk', {
      p_id: id,
      p_tutar: payload.tutar,
      p_tarih: payload.tarih,
      p_aciklama: payload.aciklama ?? null,
      p_actor_id: actorId ?? null,
    })

    if (error) {
      const code = (error as any).code
      const message = (error as any).message ?? 'Tahakkuk guncellenemedi'
      if (code === 'P0002') {
        throw ApiError.notFound(message)
      }
      if (code === 'P0001') {
        throw ApiError.conflict(message)
      }
      throw error
    }
    return data
  },

  // Sprint uyelik-baslangic-iptal-duzenle (2026-05-25): tahakkuk iptal.
  async deleteUyelikBaslangicTahakkuk(id: string, actorId?: string) {
    const { error } = await supabaseAdmin.rpc('fn_delete_uyelik_baslangic_tahakkuk', {
      p_id: id,
      p_actor_id: actorId ?? null,
    })

    if (error) {
      const code = (error as any).code
      const message = (error as any).message ?? 'Tahakkuk iptal edilemedi'
      if (code === 'P0002') {
        throw ApiError.notFound(message)
      }
      if (code === 'P0001') {
        throw ApiError.conflict(message)
      }
      throw error
    }
    return { success: true, message: 'Baslangic bedeli tahakkuku iptal edildi.' }
  },

  // TASK-BE-07 (sprint 20260511-backlog-batch1):
  // Çek path'i kendi metoduna ayrıldı. createPayment artık sadece dispatcher.
  async createPayment(paymentData: PaymentInput) {
    if (paymentData.odeme_turu === 'cek') {
      return this._createPaymentAsCek(paymentData)
    }
    return this._createPaymentNormal(paymentData)
  },

  async _createPaymentAsCek(paymentData: PaymentInput) {
    const {
      cari_hesap_id,
      proje_id,
      tutar,
      cek_id,
      vade_tarihi,
      banka,
      sube,
      belge_no,
      aciklama,
    } = paymentData

    // Mevcut bir çek seçilmişse ilişkilendirme yeterli — yeni cek_id üretilmez.
    if (cek_id) {
      return { id: cek_id, message: 'Mevcut çek ilişkilendirildi.' }
    }

    // Cari hesaptan firma_id'yi bul (cekler tablosunda firma_id zorunludur).
    const { data: cari } = await supabaseAdmin
      .from('cari_hesaplar')
      .select('firma_id')
      .eq('id', cari_hesap_id)
      .single()

    if (!cari?.firma_id) {
      throw new ApiError(400, 'Çek kaydı için geçerli bir firma cari hesabı gereklidir.')
    }

    // SEC-015 / TASK-BE-04: vade_tarihi controller'a gelmeden Zod superRefine
    // tarafından zorunlu kılınıyor (cariPaymentSchema). Bu defansif guard yalnızca
    // service-içi doğrudan çağrı (test/seed/CLI tooling) olasılığı için var; HTTP
    // path'inde unreachable. Kaldırılmaması: future regression sigortası.
    if (!vade_tarihi) {
      throw new ApiError(400, 'Çek kaydı için vade tarihi zorunludur.')
    }

    const { data: newCek, error: cekError } = await supabaseAdmin
      .from('cekler')
      .insert([{
        proje_id,
        firma_id: cari.firma_id,
        cek_no: belge_no || 'YENI-CEK',
        banka: banka || 'Belirtilmedi',
        sube: sube || '',
        tutar,
        vade_tarihi,
        durum: 'beklemede',
        aciklama,
      }])
      .select()
      .single()

    if (cekError) throw cekError

    // Çek ödendiğinde cari hareket atılacağı için burada cari_hareketler'e kayıt ATMIYORUZ.
    return {
      ...newCek,
      is_cek: true,
      message: 'Çek kaydı oluşturuldu. Cari hareket çek ödendiğinde oluşacaktır.',
    }
  },

  async _createPaymentNormal(paymentData: PaymentInput) {
    const {
      islem_turu,
      tutar,
      odeme_turu,
      banka_hesap_id,
      actorId,
      // cek-specific alanlar normal path icin kullanilmaz, drop edilir.
      cek_id: _cek_id,
      vade_tarihi: _vade_tarihi,
      banka: _banka,
      sube: _sube,
      // 2026-05-15 hotfix: is_teminat boolean sinyalini kaynak_tipi='teminat' string'ine
      // map'le. Bu mapping bilinçli olarak service katmanında yapılır ki kaynak_tipi
      // raw değer olarak client'tan kabul edilmesin (TASK-BE-08 SEC-014 mass-assignment
      // koruması; kaynak_tipi='hakedis'/'fatura' gibi başka enum değerleri enjekte edilemez).
      is_teminat,
      // Var olabilecek kaynak_tipi/kaynak_id alanlarını (test/seed/CLI path için)
      // drop et — sadece is_teminat → 'teminat' mapping geçerli.
      kaynak_tipi: _ignoredKaynakTipi,
      kaynak_id: _ignoredKaynakId,
      ...rest
    } = paymentData

    // Teminat iadesi sinyali: yalnızca giden_odeme ile birlikte anlamlı.
    // Trigger (fn_sync_teminat_iade_on_cari_hareket) zaten islem_turu IN ('giden_odeme','odeme')
    // koşulunu da kontrol ediyor, ama burada da sınırlama defansif bir katman.
    const isTeminatIadesi = !!is_teminat && islem_turu === 'giden_odeme'
    const derivedKaynakTipi = isTeminatIadesi ? 'teminat' : undefined

    // Teminat iadesi için açıklama otomatik "Teminat İadesi" set edilir; kullanıcı kendi
    // açıklamasını girmişse korunur (kayıt amacının net olması + cari ekstrede ayırt
    // edilebilirlik için).
    const rawAciklama = typeof rest.aciklama === 'string' ? rest.aciklama.trim() : ''
    const derivedAciklama = isTeminatIadesi && !rawAciklama
      ? 'Teminat İadesi'
      : rest.aciklama

    const { data: hareket, error: hareketError } = await supabaseAdmin.rpc('fn_create_payment_atomic', {
      p_payment_data: {
        ...rest,
        aciklama: derivedAciklama,
        islem_turu,
        odeme_turu,
        tutar,
        banka_hesap_id,
        kaynak_tipi: derivedKaynakTipi,
      },
      p_actor_id: actorId ?? null,
    })

    if (hareketError) throw hareketError
    return hareket
  },

  async undoClosure(id: string, actorId?: string) {
    const { data, error } = await supabaseAdmin.rpc('fn_undo_payment_match', {
      p_movement_id: id,
      p_actor_id: actorId ?? null
    });

    if (error) throw error;
    if (data && data.success === false) {
      throw new ApiError(400, data.message);
    }

    return data;
  },

  async undoHakedisClosure(id: string, actorId?: string) {
    const { data, error } = await supabaseAdmin.rpc('fn_undo_hakedis_closure', {
      p_hakedis_id: id,
      p_actor_id: actorId ?? null
    });

    if (error) throw error;
    if (data && data.success === false) {
      throw new ApiError(400, data.message);
    }

    return data;
  },

  // A3 (sprint 20260511-uye-tahsilat-firma-revisions): Aidat satırı bazında toplu undo.
  // RPC fn_undo_aidat_closure ile bir aidata bağlı tüm cari_hareketler eşleşmelerini
  // tek transaction'da temizler, aidat durumunu yeniden hesaplar.
  async undoAidatClosure(aidatId: string, actorId?: string) {
    const { data, error } = await supabaseAdmin.rpc('fn_undo_aidat_closure', {
      p_aidat_id: aidatId,
      p_actor_id: actorId ?? null,
    });

    if (error) throw error;
    if (data && data.success === false) {
      throw new ApiError(400, data.message);
    }

    return data;
  },

  // Başlangıç bedeli tahakkuku bazında toplu undo. fn_undo_aidat_closure muadili,
  // kaynak_tipi='baslangic_bedeli' filtresi kullanır. Bug: UyeDetailPage Aidat Hesapları
  // tab'inde başlangıç bedeli virtual row'unun "Geri Al" butonu aidat endpoint'ine
  // bb-<uuid> formatlı id yolluyordu → 400; bu endpoint doğru semantiği sağlar.
  async undoBaslangicBedeliClosure(tahakkukId: string, actorId?: string) {
    const { data, error } = await supabaseAdmin.rpc('fn_undo_baslangic_bedeli_closure', {
      p_tahakkuk_id: tahakkukId,
      p_actor_id: actorId ?? null,
    });

    if (error) throw error;
    if (data && data.success === false) {
      throw new ApiError(400, data.message);
    }

    return data;
  },

  async performFifoClosure(projeId: string, actorId?: string) {
    try {
      const { data, error } = await supabaseAdmin.rpc('fn_match_project_payments_fifo', {
        p_proje_id: projeId,
        p_actor_id: actorId ?? null
      });

      if (error) {
        logger.error('fn_match_project_payments_fifo RPC error', { error, projeId });
        // PG hatalarını anlamlı user-facing mesajlara çevir
        // 23505 = unique violation (eşleşme çakışması), P0001 = RAISE EXCEPTION
        const pgCode = (error as any).code
        const pgMessage = (error as any).message ?? ''
        if (pgCode === '23505') {
          throw ApiError.conflict('Hesap kapama sırasında çakışan eşleştirme bulundu. Lütfen mevcut eşleştirmeleri kontrol edin.')
        }
        if (pgCode === 'P0001' && typeof pgMessage === 'string' && pgMessage.length < 200) {
          throw ApiError.badRequest(pgMessage)
        }
        throw error;
      }

      // RPC dönüş gövdesi { success: false, message: '...' } ise hata olarak ele al
      if (data && typeof data === 'object' && (data as any).success === false) {
        const msg = (data as any).message || 'Hesap kapama gerçekleştirilemedi'
        throw ApiError.badRequest(String(msg))
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
