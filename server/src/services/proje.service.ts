import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { getAllowedProjeIds } from '../utils/projectGuard'
import { parse } from 'csv-parse/sync'
import logger from '../utils/logger'

export const projeService = {
  async exportSerefiye(projeId: string) {
    // Tüm CSV çıktılarında "Proje Adı:" başlığı standart — server-side blob
    // endpoint'i de bu standardı uygular (frontend tarafındaki rapor CSV'leri
    // ile tutarlı çıktı). Proje adı ek bir round-trip ile çekiliyor; tablo
    // küçük olduğu için maliyet ihmal edilebilir.
    const projePromise = supabaseAdmin
      .from('projeler')
      .select('proje_adi')
      .eq('id', projeId)
      .maybeSingle()

    const dataPromise = supabaseAdmin
      .from('serefiye_tablosu')
      .select('daire_no, kat, yon, m2, oda_sayisi, serefiye_orani')
      .eq('proje_id', projeId)
      .order('daire_sira_no', { ascending: true })

    const [{ data: projeRow }, { data, error }] = await Promise.all([projePromise, dataPromise])

    if (error) throw error

    const header = ['daire_no', 'kat', 'yon', 'm2', 'oda_sayisi', 'serefiye_orani']
    const rows = (data || []).map(r => [
      r.daire_no,
      r.kat || '',
      r.yon || '',
      r.m2 || '',
      r.oda_sayisi || '',
      r.serefiye_orani
    ])

    const lines: string[] = []
    const projeAdi = projeRow?.proje_adi?.trim()
    if (projeAdi) {
      // Proje Adı satırı: frontend csvExport.ts ile aynı biçim (tek satır + boş satır).
      // serefiye CSV'si virgül-ayraçlı, frontend rapor CSV'leri ise noktalı-virgül kullanır;
      // başlık virgül içermediği için her iki format için de güvenli.
      lines.push(`Proje Adı: ${projeAdi}`)
      lines.push('')
    }
    lines.push(header.join(','))
    rows.forEach(row => lines.push(row.join(',')))

    // BOM korunuyor: Excel TR karakter uyumu için.
    return '﻿' + lines.join('\n')
  },

  async importSerefiye(projeId: string, buffer: Buffer) {
    // Toleranslı parse: PR #40 ile export'a eklenen "Proje Adı:" başlığı,
    // Excel'in TR locale'de comma → semicolon'a çevirmesi ve Excel'in eklediği
    // placeholder "Column1;Column2;..." satırı gibi gerçek-dünya artifact'larıyla
    // başa çıkar. Strateji: daire_no kelimesini içeren satırı header olarak bul,
    // öncesini at; delimiter'ı header satırından otomatik tespit et.

    const text = buffer.toString('utf8').replace(/^﻿/, '')
    const rawLines = text.split(/\r?\n/)

    const headerIdx = rawLines.findIndex(l => /\bdaire_no\b/i.test(l))
    if (headerIdx === -1) {
      throw ApiError.badRequest('CSV içinde "daire_no" başlığı bulunamadı. Dosya formatını kontrol edin.')
    }

    const headerLine = rawLines[headerIdx]
    // Header'da hangi ayraç çoğunluksa onu seç. Tek alanlı bozuk header için fallback comma.
    const semiCount = (headerLine.match(/;/g) || []).length
    const commaCount = (headerLine.match(/,/g) || []).length
    const delimiter = semiCount > commaCount ? ';' : ','

    const csvSlice = rawLines.slice(headerIdx).join('\n')

    let records: any[]
    try {
      records = parse(csvSlice, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter,
        relax_column_count: true
      })
    } catch (err: any) {
      logger.error('Serefiye CSV parse hatası:', err.message)
      throw ApiError.badRequest(`CSV ayrıştırma hatası: ${err.message}`)
    }

    // TR ondalık (virgül) → ABD ondalık (nokta) — parseFloat("1,05") JS'te 1 döner.
    const toFloat = (v: any): number => {
      if (v === null || v === undefined || v === '') return NaN
      const s = String(v).trim().replace(',', '.')
      return parseFloat(s)
    }

    const updates = records.map((r: any) => {
      const daire_no = String(r.daire_no || '').trim()
      if (!daire_no) return null

      const m2Val = toFloat(r.m2)
      const oranVal = toFloat(r.serefiye_orani)
      const katVal = r.kat ? parseInt(String(r.kat).trim(), 10) : NaN

      return {
        daire_no,
        kat: Number.isFinite(katVal) ? katVal : null,
        yon: r.yon ? String(r.yon).substring(0, 50) : null,
        m2: Number.isFinite(m2Val) ? m2Val : null,
        oda_sayisi: r.oda_sayisi ? String(r.oda_sayisi).substring(0, 20) : null,
        serefiye_orani: Number.isFinite(oranVal) ? oranVal : 1.0
      }
    }).filter(Boolean)

    // Sprint followup-deps-perf-cleanup (2026-05-25): N+1 for-loop UPDATE
    // yerine fn_import_serefiye_bulk RPC ile tek round-trip. 1000 satir icin
    // ~1000x daha hizli (network + query plan overhead bir kere yerine N kez).
    const { data, error } = await supabaseAdmin.rpc('fn_import_serefiye_bulk', {
      p_proje_id: projeId,
      p_rows: updates as any,
    })

    if (error) {
      logger.error('Serefiye bulk import RPC hatasi', {
        code: (error as any).code,
        message: (error as any).message,
        projeId,
        rowCount: updates.length,
      })
      throw error
    }

    return {
      updated: Number((data as any)?.updated ?? 0),
      failed: Number((data as any)?.failed ?? 0),
      total: Number((data as any)?.total ?? updates.length),
    }
  },

  async list(opts: { userId?: string; isAdmin?: boolean; arsiv?: boolean } = {}) {
    // Arşiv görünümü: silindi_mi=true. Aktif görünüm: silindi_mi=false.
    // (Yeni proje silme akışı, 2026-05-24)
    const arsivMod = opts.arsiv === true

    let q = supabaseAdmin
      .from('projeler')
      .select('*')
      .eq('silindi_mi', arsivMod)
      .order(arsivMod ? 'silinme_tarihi' : 'created_at', { ascending: false })

    // Global admin tüm projeleri görür. Diğer kullanıcılar sadece üye oldukları
    // projeleri görür — service-role RLS bypass ettiği için üyelik filtresi
    // burada uygulanır (defense-in-depth: RLS de aynı kontrolü yapar).
    // Arşiv listesinde ek bir kısıt: non-admin kullanıcı sadece OWNER olduğu
    // arşivdeki projeleri görebilir (manager/user arşivi göremez).
    let roleByProje = new Map<string, 'admin' | 'staff' | 'viewer'>()
    if (!opts.isAdmin && opts.userId) {
      const membershipQ = supabaseAdmin
        .from('proje_uyelikleri')
        .select('proje_id, rol')
        .eq('user_id', opts.userId)
      if (arsivMod) {
        membershipQ.eq('rol', 'owner')
      }
      const { data: memberships } = await membershipQ
      const rows = memberships ?? []
      if (rows.length === 0) {
        return []
      }
      roleByProje = new Map(rows.map((r: { proje_id: string; rol: string }) => [r.proje_id, r.rol as 'admin' | 'staff' | 'viewer']))
      q = q.in('id', Array.from(roleByProje.keys()))
    }

    const { data, error } = await q
    if (error) throw error

    // Her projeye kullanıcının rolünü ekle — frontend gating için.
    return (data ?? []).map((p: any) => ({
      ...p,
      current_user_role: opts.isAdmin ? 'admin' : roleByProje.get(p.id) ?? null,
    }))
  },

  async getById(id: string, opts: { yil?: number } = {}) {
    const { data, error } = await supabaseAdmin
      .from('projeler')
      .select('*, proje_is_kalemleri(*), bloklar(*)')
      .eq('id', id)
      .order('created_at', { foreignTable: 'bloklar', ascending: true })
      .single()

    if (error) throw ApiError.notFound('Proje bulunamadı')

    if (!data || !Array.isArray(data.proje_is_kalemleri) || data.proje_is_kalemleri.length === 0) {
      return data
    }

    const kalemIds = data.proje_is_kalemleri.map((k: any) => k.id)

    // Tüm yıllar için plan toplamlarını tek sorguda topluyoruz. Frontend hem
    // tek-yıl (geriye uyumlu yillik_plan_toplami) hem çoklu-yıl (matrix) görünümü
    // için aynı payload'u kullanabilsin diye yil filtresini server-side
    // uygulamak yerine post-filter ediyoruz. Bir projenin yıl sayısı tipik
    // olarak 1-5 arası — yük ihmal edilebilir.
    const { data: planRows, error: planErr } = await supabaseAdmin
      .from('yillik_plan_kalemleri')
      .select('proje_is_kalemi_id, planlanan_tutar, yillik_harcama_planlari!inner(yil, proje_id)')
      .in('proje_is_kalemi_id', kalemIds)
      .eq('yillik_harcama_planlari.proje_id', id)

    if (planErr) throw planErr

    // Yıl → kalem_id → tutar matrisi
    const byYil = new Map<number, Map<string, number>>()
    const yilSet = new Set<number>()
    for (const row of planRows ?? []) {
      const kid = (row as any).proje_is_kalemi_id as string
      const yil = Number((row as any).yillik_harcama_planlari?.yil)
      if (!Number.isFinite(yil)) continue
      yilSet.add(yil)
      const tutar = Number((row as any).planlanan_tutar) || 0
      if (!byYil.has(yil)) byYil.set(yil, new Map())
      const bucket = byYil.get(yil)!
      bucket.set(kid, (bucket.get(kid) || 0) + tutar)
    }

    // Yıllık plan yılları (sıralı, çoklu-yıl sütunları için)
    const yillar = Array.from(yilSet).sort((a, b) => a - b)

    // Her kaleme yil_toplamlari (matrix) ve geriye uyumlu yillik_plan_toplami ekle
    const aktifYil = opts.yil
    data.proje_is_kalemleri = data.proje_is_kalemleri.map((k: any) => {
      const yilToplamlari: Record<string, number> = {}
      for (const y of yillar) {
        yilToplamlari[String(y)] = byYil.get(y)?.get(k.id) ?? 0
      }
      return {
        ...k,
        // Çoklu-yıl matrisi (yeni alan)
        yil_toplamlari: yilToplamlari,
        // Geriye uyumlu tek-yıl alanı (yil parametresi verildiyse o yılın değeri,
        // aksi halde undefined → eski client davranışı kırılmaz)
        yillik_plan_toplami: aktifYil ? (byYil.get(aktifYil)?.get(k.id) ?? 0) : undefined,
      }
    })

    // Proje seviyesinde plan yılları listesi (frontend kolon üretimi için)
    ;(data as any).yillik_plan_yillari = yillar

    return data
  },

  async create(body: Record<string, any>, actorId?: string) {
    const { bloklar, ...projeData } = body

    // Aynı isimde birden fazla blok gönderilmiş mi kontrol et
    if (bloklar && bloklar.length > 0) {
      const names = bloklar.map((b: any) => b.blok_adi)
      if (new Set(names).size !== names.length) {
        throw ApiError.badRequest('Aynı isimde birden fazla blok ekleyemezsiniz.')
      }
    }

    // Sprint role-system-modernization (PR-B): projeler.owner_user_id NOT NULL.
    // Service-role bypass'da auth.uid() NULL → BEFORE INSERT trigger
    // owner_user_id'yi dolduramaz; backend explicit aktör ID'sini yazmalı.
    // (AFTER INSERT trigger yine owner üyeliğini idempotent şekilde ekler.)
    if (actorId && !projeData.owner_user_id) {
      projeData.owner_user_id = actorId
    }

    if (!projeData.owner_user_id) {
      throw ApiError.badRequest('Proje sahibi (owner) belirlenemedi — oturum bilgisi eksik')
    }

    const { data: proje, error: projeError } = await supabaseAdmin
      .from('projeler')
      .insert([projeData])
      .select()
      .single()

    if (projeError) throw projeError

    if (bloklar && bloklar.length > 0) {
      const bloklarWithProjeId = bloklar.map((b: any) => ({ ...b, proje_id: proje.id }))
      const { error: blokError } = await supabaseAdmin
        .from('bloklar')
        .insert(bloklarWithProjeId)
      
      if (blokError) {
        if (blokError.code === '23505') throw ApiError.badRequest('Bu blok adı zaten mevcut.')
        throw blokError
      }
    }

    return proje
  },

  async update(id: string, body: Record<string, any>) {
    const { bloklar, id: _, created_at, ...projeData } = body

    // Aynı isimde birden fazla blok gönderilmiş mi kontrol et
    if (bloklar && bloklar.length > 0) {
      const names = bloklar.map((b: any) => b.blok_adi)
      if (new Set(names).size !== names.length) {
        throw ApiError.badRequest('Aynı isimde birden fazla blok ekleyemezsiniz.')
      }
    }

    const { data: proje, error: projeError } = await supabaseAdmin
      .from('projeler')
      .update(projeData)
      .eq('id', id)
      .select()
      .single()

    if (projeError) throw projeError
    if (!proje) throw ApiError.notFound('Proje bulunamadı')

    if (bloklar) {
      // 1. Mevcut blokları al
      const { data: existingBloklar, error: fetchError } = await supabaseAdmin
        .from('bloklar')
        .select('*')
        .eq('proje_id', id)
      
      if (fetchError) throw fetchError

      // 2. Silinecekleri belirle (ID'si olan ama gelen listede olmayanlar)
      const incomingIds = bloklar.filter((b: any) => b.id).map((b: any) => b.id)
      const toDelete = existingBloklar?.filter(eb => eb.id && !incomingIds.includes(eb.id)) || []

      for (const blokToDelete of toDelete) {
        // Bağımlılık kontrolleri
        const { count: uyeCount } = await supabaseAdmin.from('uyeler').select('id', { count: 'exact', head: true }).eq('blok_id', blokToDelete.id)
        if ((uyeCount || 0) > 0) throw ApiError.badRequest(`'${blokToDelete.blok_adi}' bloğunda kayıtlı üyeler olduğu için silinemez.`)

        const { count: serefiyeCount } = await supabaseAdmin.from('serefiye_tablosu').select('id', { count: 'exact', head: true }).eq('blok_id', blokToDelete.id)
        if ((serefiyeCount || 0) > 0) throw ApiError.badRequest(`'${blokToDelete.blok_adi}' bloğu için şerefiye tablosu mevcut.`)

        await supabaseAdmin.from('bloklar').delete().eq('id', blokToDelete.id)
      }

      // 3. Upsert (Güncelle veya Ekle)
      for (const blok of bloklar) {
        const { id: blokId, created_at, updated_at, proje_id: p_id, ...blokData } = blok
        
        try {
          if (blokId) {
            // ID varsa: Direkt güncelle
            const { error: updateError } = await supabaseAdmin
              .from('bloklar')
              .update({ ...blokData, updated_at: new Date().toISOString() })
              .eq('id', blokId)
            
            if (updateError) throw updateError
          } else {
            // ID yoksa: İsim üzerinden kontrol et (Mükerrerlik ve Otomatik Eşleşme)
            const existingMatch = existingBloklar?.find(eb => eb.blok_adi === blokData.blok_adi)
            
            if (existingMatch) {
              // İsim eşleştiyse güncelle (ID kazandırarak)
              const { error: updateError } = await supabaseAdmin
                .from('bloklar')
                .update({ ...blokData, updated_at: new Date().toISOString() })
                .eq('id', existingMatch.id)
              
              if (updateError) throw updateError
            } else {
              // Tamamen yeni
              const { error: insertError } = await supabaseAdmin
                .from('bloklar')
                .insert([{ ...blokData, proje_id: id }])
              
              if (insertError) throw insertError
            }
          }
        } catch (err: any) {
          if (err.code === '23505') throw ApiError.badRequest(`'${blokData.blok_adi}' isminde bir blok zaten mevcut.`)
          throw err
        }
      }
    }

    return proje
  },

  // İş kalemleri
  async createIsKalemi(projeId: string, body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('proje_is_kalemleri')
      .insert([{ ...body, proje_id: projeId }])
      .select()
      .single()

    if (error) {
      logger.error('createIsKalemi insert error', { error, projeId })
      throw error
    }

    // Yeni ANA kalem eklendiğinde, projedeki tüm yıllık planlara 12 aylık boş kayıtlar
    const { data: plans } = await supabaseAdmin
      .from('yillik_harcama_planlari')
      .select('id')
      .eq('proje_id', projeId)

    if (plans && plans.length > 0) {
      const planKalemleri: any[] = []
      plans.forEach(plan => {
        for (let ay = 1; ay <= 12; ay++) {
          planKalemleri.push({
            plan_id: plan.id,
            proje_is_kalemi_id: data.id,
            ay,
            planlanan_tutar: 0,
            gerceklesen_tutar: 0
          })
        }
      })
      const { error: planError } = await supabaseAdmin.from('yillik_plan_kalemleri').insert(planKalemleri)
      if (planError) {
        logger.error('yillik_plan_kalemleri insert error', { planError, projeId, isKalemiId: data.id })
        throw planError
      }
    }

    return data
  },

  async updateIsKalemi(id: string, body: Record<string, any>) {
    // proje_id middleware (requireProjectAccess) için body'de taşınır; UPDATE
    // payload'ı FK'yi yeniden yazmasın — kalemin başka projeye taşınma vektörünü kapat.
    const { proje_id: _pid, projeId: _pidCamel, ...updatePayload } = body
    const { data, error } = await supabaseAdmin
      .from('proje_is_kalemleri')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    if (!data) throw ApiError.notFound('İş kalemi bulunamadı')
    return data
  },

  async deleteIsKalemi(id: string) {
    const { error } = await supabaseAdmin
      .from('proje_is_kalemleri')
      .delete()
      .eq('id', id)

    if (error) {
      if (error.code === '23503') throw ApiError.badRequest('Alt kalemleri olan bir kalem silinemez')
      throw error
    }
  },

  // Yıllık harcama planı
  async getYillikPlan(projeId: string, yil: number) {
    // REV-PLAN-01: Adet × Birim Fiyat sekmesinde input default'u harcama kaleminin
    // master birim fiyatı olabilsin diye proje_is_kalemleri.birim_fiyat join'e eklendi.
    const { data: plan, error } = await supabaseAdmin
      .from('yillik_harcama_planlari')
      .select('*, yillik_plan_kalemleri(*, proje_is_kalemleri(kalem_kodu, tanim, birim_fiyat))')
      .eq('proje_id', projeId)
      .eq('yil', yil)
      .maybeSingle()

    if (error) throw error
    if (!plan) return null
    
    // Eğer toplam_butce 0 ise, kalemlerin toplamından veya proje genel bütçesinden fallback yapabiliriz
    if (!plan.toplam_butce || plan.toplam_butce === 0) {
      const { data: proje } = await supabaseAdmin.from('projeler').select('toplam_butce').eq('id', projeId).single()
      plan.toplam_butce = proje?.toplam_butce || 0
    }

    return plan
  },

  async createYillikPlan(projeId: string, body: Record<string, any>) {
    // 1. Proje bilgilerini al (Başlangıç/Bitiş yılları için)
    const { data: proje, error: pErr } = await supabaseAdmin
      .from('projeler')
      .select('baslangic_tarihi, bitis_tarihi')
      .eq('id', projeId)
      .single()

    if (pErr || !proje) throw ApiError.notFound('Proje bulunamadı')

    // 2. Proje iş kalemleri (Harcama kalemleri) var mı kontrol et
    const { data: isKalemleri } = await supabaseAdmin
      .from('proje_is_kalemleri')
      .select('id')
      .eq('proje_id', projeId)

    if (!isKalemleri || isKalemleri.length === 0) {
      throw ApiError.badRequest('Bu projeye ait Harcama Kalemi bulunamadı. Önce Harcama Kalemi eklemelisiniz.')
    }

    // 3. Yılları belirle
    let targetYears: number[] = []
    if (body.yil) {
      targetYears = [parseInt(body.yil)]
    } else {
      const startYear = proje.baslangic_tarihi ? new Date(proje.baslangic_tarihi).getFullYear() : new Date().getFullYear()
      const endYear = proje.bitis_tarihi ? new Date(proje.bitis_tarihi).getFullYear() : startYear + 1
      for (let y = startYear; y <= endYear; y++) {
        targetYears.push(y)
      }
    }

    const results = []

    for (const targetYear of targetYears) {
      // Bu yıl için plan var mı kontrol et
      const { data: existingPlan } = await supabaseAdmin
        .from('yillik_harcama_planlari')
        .select('id')
        .eq('proje_id', projeId)
        .eq('yil', targetYear)
        .maybeSingle()

      if (existingPlan) continue // Zaten varsa atla

      // Plan oluştur
      const { data: plan, error } = await supabaseAdmin
        .from('yillik_harcama_planlari')
        .insert([{ proje_id: projeId, ...body, yil: targetYear }]) // body'deki yılı ez
        .select()
        .single()

      if (error) {
        if (error.code === '23505') continue
        throw error
      }

      // 3. Plan kalemlerini oluştur (12 ay)
      const planKalemleri: Record<string, any>[] = []
      for (const kalem of isKalemleri) {
        for (let ay = 1; ay <= 12; ay++) {
          planKalemleri.push({
            plan_id: plan.id,
            proje_is_kalemi_id: kalem.id,
            ay,
            planlanan_tutar: 0,
            gerceklesen_tutar: 0
          })
        }
      }
      // ON CONFLICT (plan_id, proje_is_kalemi_id, ay) DO NOTHING
      await supabaseAdmin.from('yillik_plan_kalemleri').upsert(planKalemleri, { onConflict: 'plan_id,proje_is_kalemi_id,ay' })
      results.push(plan)
    }

    return results.length > 0 ? results[0] : { message: 'Tüm dönemler için planlar zaten mevcut.' }
  },

  async updatePlanKalemi(id: string, body: Record<string, any>) {
    // Güvenli güncelleme için metadata alanlarını temizle
    const { id: _, created_at, updated_at, plan_id, proje_is_kalemi_id, ay, ...updateData } = body

    // Adet veya birim_fiyat geldiyse server-side hesapla — tek truth source
    const adetTouched = Object.prototype.hasOwnProperty.call(updateData, 'planlanan_adet')
    const fiyatTouched = Object.prototype.hasOwnProperty.call(updateData, 'planlanan_birim_fiyat')

    if (adetTouched || fiyatTouched) {
      let adet = updateData.planlanan_adet
      let fiyat = updateData.planlanan_birim_fiyat

      // Eksik tarafı DB'den oku — kullanıcı sadece adeti veya sadece fiyatı değiştirmiş olabilir
      if (!adetTouched || !fiyatTouched) {
        const { data: existing, error: readErr } = await supabaseAdmin
          .from('yillik_plan_kalemleri')
          .select('planlanan_adet, planlanan_birim_fiyat')
          .eq('id', id)
          .single()
        if (readErr) throw readErr
        if (!existing) throw ApiError.notFound('Plan kalemi bulunamadı')
        if (!adetTouched) adet = existing.planlanan_adet
        if (!fiyatTouched) fiyat = existing.planlanan_birim_fiyat
      }

      if (adet != null && fiyat != null) {
        updateData.planlanan_tutar = Math.round(Number(adet) * Number(fiyat) * 100) / 100
      } else {
        updateData.planlanan_tutar = 0
      }
    }

    const { data, error } = await supabaseAdmin
      .from('yillik_plan_kalemleri')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    if (!data) throw ApiError.notFound('Plan kalemi bulunamadı')
    return data
  },

  async deletePlanKalemleri(planId: string, isKalemiId: string) {
    const { error } = await supabaseAdmin
      .from('yillik_plan_kalemleri')
      .delete()
      .eq('plan_id', planId)
      .eq('proje_is_kalemi_id', isKalemiId)

    if (error) throw error
  },

  async getAktifProje() {
    // Durumu 'devam_ediyor' olan veya en son oluşturulan aktif projeyi getir
    const { data, error } = await supabaseAdmin
      .from('projeler')
      .select('*, bloklar(*)')
      .eq('aktif', true)
      .order('created_at', { ascending: false })
      .order('blok_adi', { foreignTable: 'bloklar', ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return data
  },

  async getMusaitDaireler(blokId: string) {
    // Blok bilgilerini al
    const { data: blok, error: blokError } = await supabaseAdmin
      .from('bloklar')
      .select('*')
      .eq('id', blokId)
      .single()

    if (blokError) throw blokError

    // Bu bloktaki boş daireleri şerefiye tablosundan al
    const { data: daireler, error: daireError } = await supabaseAdmin
      .from('serefiye_tablosu')
      .select('id, daire_no, serefiye_orani')
      .eq('blok_id', blokId)
      .eq('durum', 'bos')

    if (daireError) throw daireError
    return daireler
  },

  // Şerefiye Yönetimi
  async getSerefiye(projeId: string) {
    const { data, error } = await supabaseAdmin
      .from('serefiye_tablosu')
      .select('*, bloklar(blok_adi), uyeler!uye_id(ad, soyad, uye_no)')
      .eq('proje_id', projeId)
      .order('daire_sira_no', { ascending: true })

    if (error) throw error

    // Blok adı ve Daire Sıra No'ya göre sırala
    return (data || []).sort((a, b) => {
      const blokA = a.bloklar?.blok_adi || ''
      const blokB = b.bloklar?.blok_adi || ''
      if (blokA !== blokB) return blokA.localeCompare(blokB)
      // Sayısal sıralama sağla (daire_sira_no integer olmalı)
      return (Number(a.daire_sira_no) || 0) - (Number(b.daire_sira_no) || 0)
    })
  },

  async generateSerefiye(projeId: string) {
    // Tekrar üretime karşı koruma — mevcut kayıt varsa conflict dön
    const { count: existingCount, error: countError } = await supabaseAdmin
      .from('serefiye_tablosu')
      .select('id', { count: 'exact', head: true })
      .eq('proje_id', projeId)

    if (countError) throw countError
    if ((existingCount || 0) > 0) {
      throw ApiError.badRequest('Bu proje için şerefiye tablosu zaten oluşturulmuş. Önce mevcut kayıtları temizleyin.')
    }

    // Proje bloklarını al
    const { data: bloklar, error: blokError } = await supabaseAdmin
      .from('bloklar')
      .select('*')
      .eq('proje_id', projeId)

    if (blokError) throw blokError

    const rows: any[] = []
    for (const blok of bloklar) {
      for (let i = 0; i < blok.toplam_daire; i++) {
        const daireSiraNo = (blok.daire_baslangic_no || 1) + i
        rows.push({
          proje_id: projeId,
          blok_id: blok.id,
          daire_sira_no: daireSiraNo,
          daire_no: `${blok.blok_adi}.${daireSiraNo}`,
          serefiye_orani: 1.000,
          durum: 'bos'
        })
      }
    }

    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from('serefiye_tablosu').insert(rows)
      if (error) throw error
    }

    return { generated: rows.length }
  },

  async syncSerefiye(projeId: string) {
    // 1. Proje bloklarını al
    const { data: bloklar, error: blokError } = await supabaseAdmin
      .from('bloklar')
      .select('*')
      .eq('proje_id', projeId)

    if (blokError) throw blokError

    // 2. Mevcut şerefiye kayıtlarını al (sadece blok_id ve daire_sira_no yeterli)
    const { data: existingSerefiye, error: serefiyeError } = await supabaseAdmin
      .from('serefiye_tablosu')
      .select('blok_id, daire_sira_no')
      .eq('proje_id', projeId)

    if (serefiyeError) throw serefiyeError

    const existingMap = new Set(
      (existingSerefiye || []).map(s => `${s.blok_id}-${s.daire_sira_no}`)
    )

    const newRows: any[] = []
    for (const blok of bloklar) {
      for (let i = 0; i < (blok.toplam_daire || 0); i++) {
        const daireSiraNo = (blok.daire_baslangic_no || 1) + i
        const key = `${blok.id}-${daireSiraNo}`
        
        if (!existingMap.has(key)) {
          newRows.push({
            proje_id: projeId,
            blok_id: blok.id,
            daire_sira_no: daireSiraNo,
            daire_no: `${blok.blok_adi}.${daireSiraNo}`,
            serefiye_orani: 1.000,
            durum: 'bos'
          })
        }
      }
    }

    if (newRows.length > 0) {
      const { error } = await supabaseAdmin.from('serefiye_tablosu').insert(newRows)
      if (error) throw error
    }

    return { added: newRows.length }
  },

  async resetSerefiye(projeId: string) {
    const { data, error } = await supabaseAdmin.rpc('reset_serefiye_table', {
      p_proje_id: projeId
    })

    if (error) {
      if (error.message.includes('dolu daireler')) {
        throw ApiError.badRequest(error.message)
      }
      throw error
    }

    return { generated: data }
  },

  async clearSerefiye(projeId: string) {
    // 1. Doluluk kontrolü
    const { count: doluCount, error: checkError } = await supabaseAdmin
      .from('serefiye_tablosu')
      .select('id', { count: 'exact', head: true })
      .eq('proje_id', projeId)
      .eq('durum', 'dolu')

    if (checkError) throw checkError
    if ((doluCount || 0) > 0) {
      throw ApiError.badRequest('Bu projede kayıtlı üyeler (dolu daireler) bulunduğu için tablo silinemez.')
    }

    // 2. Sil
    const { error } = await supabaseAdmin
      .from('serefiye_tablosu')
      .delete()
      .eq('proje_id', projeId)

    if (error) throw error
    return { success: true }
  },

  async updateSerefiye(id: string, body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('serefiye_tablosu')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        throw ApiError.badRequest('Bu üye zaten başka bir daireye atanmış.')
      }
      throw error
    }
    return data
  },

  // --------------------------------------------------------------------------
  // Sprint proje-silme-akisi (2026-05-24): İki aşamalı silme akışı.
  // Arşivle (soft) → Kalıcı Sil (hard, CASCADE).
  // --------------------------------------------------------------------------

  /**
   * Projenin tüm alt tablolardaki kayıt sayılarını döner.
   * Frontend onay modalı bu sayıları "X üye, Y fatura silinecek" şeklinde gösterir.
   * Yetki kontrolü route layer'da requireProjectAccess middleware'i ile yapılır.
   */
  async getSilmeOnizleme(projeId: string) {
    const { data, error } = await supabaseAdmin.rpc('fn_proje_silme_onizleme', {
      p_proje_id: projeId,
    })
    if (error) throw error
    return data as Record<string, number>
  },

  /**
   * Soft-delete: projeyi arşivle. silindi_mi=true → RLS helper'ları (is_project_*)
   * artık bu projeyi "yok" sayar; tüm alt tablo mutasyonları engellenir.
   * Geri alınabilir (arsivdenGeriAl).
   */
  async arsivle(projeId: string, sebep: string, actorId: string) {
    // Mevcut proje aktif mi? Çift arşivlemeyi engelle.
    const { data: mevcut, error: fetchErr } = await supabaseAdmin
      .from('projeler')
      .select('silindi_mi')
      .eq('id', projeId)
      .single()
    if (fetchErr) throw ApiError.notFound('Proje bulunamadı')
    if (mevcut.silindi_mi) {
      throw ApiError.badRequest('Proje zaten arşivde')
    }

    const { data, error } = await supabaseAdmin
      .from('projeler')
      .update({
        silindi_mi: true,
        silinme_tarihi: new Date().toISOString(),
        silinme_sebebi: sebep,
        silen_kullanici_id: actorId,
      })
      .eq('id', projeId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Soft-delete geri al. silindi_mi=false → proje aktif olarak listeye geri döner.
   */
  async arsivdenGeriAl(projeId: string) {
    const { data: mevcut, error: fetchErr } = await supabaseAdmin
      .from('projeler')
      .select('silindi_mi')
      .eq('id', projeId)
      .single()
    if (fetchErr) throw ApiError.notFound('Proje bulunamadı')
    if (!mevcut.silindi_mi) {
      throw ApiError.badRequest('Proje zaten aktif (arşivde değil)')
    }

    const { data, error } = await supabaseAdmin
      .from('projeler')
      .update({
        silindi_mi: false,
        silinme_tarihi: null,
        silinme_sebebi: null,
        silen_kullanici_id: null,
      })
      .eq('id', projeId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Hard-delete: CASCADE ile arşivdeki projeyi kalıcı siler.
   *
   * Yetki kuralı (controller tarafından çağrılmadan ÖNCE garanti edilmiş olmalı):
   *   - Proje arşivde (silindi_mi=true) — RPC bunu da doğrular.
   *   - Veri varsa (toplam_kayit > 0) → caller global admin olmalı.
   *   - Boşsa → caller global admin VEYA arşivdeki projenin owner'ı.
   *
   * Bu metod yalın execute: yetki controller'da uygulanır.
   * RPC döndürdüğü etkilenen kayıt sayılarını controller raporlar.
   */
  async kaliciSil(projeId: string) {
    const { data, error } = await supabaseAdmin.rpc('fn_proje_hard_delete', {
      p_proje_id: projeId,
    })
    if (error) {
      // RPC içindeki RAISE EXCEPTION'ları semantik hatalara map et.
      const msg = (error.message || '').toLowerCase()
      if (msg.includes('arşivlenmiş olmalı') || msg.includes('arsivlenmis olmali')) {
        throw ApiError.badRequest('Kalıcı silmeden önce proje arşivlenmiş olmalı')
      }
      if (msg.includes('bulunamadı') || msg.includes('bulunamadi')) {
        throw ApiError.notFound('Proje bulunamadı')
      }
      throw error
    }
    return data as {
      success: boolean
      proje_id: string
      proje_adi: string
      toplam_kayit: number
      etkilenen: Record<string, number>
    }
  },

  /**
   * Caller'ın bir projedeki proje_uyelikleri.rol değerini döner.
   * Kalıcı silme yetki kontrolünde kullanılır (owner mı?).
   * Üye değilse null.
   */
  async getProjeRol(projeId: string, userId: string): Promise<string | null> {
    const { data } = await supabaseAdmin
      .from('proje_uyelikleri')
      .select('rol')
      .eq('proje_id', projeId)
      .eq('user_id', userId)
      .maybeSingle()
    return data?.rol ?? null
  },

  /**
   * Sadece proje meta'sını döner (proje_adi, silindi_mi). Kalıcı silme onayı
   * için "yazdığınız ad eşleşmiyor" guard'ında kullanılır.
   */
  async getProjeMetaForDelete(projeId: string) {
    const { data, error } = await supabaseAdmin
      .from('projeler')
      .select('id, proje_adi, silindi_mi')
      .eq('id', projeId)
      .single()
    if (error) throw ApiError.notFound('Proje bulunamadı')
    return data as { id: string; proje_adi: string; silindi_mi: boolean }
  },

  /**
   * Sprint desktop-offline-mode (2026-05-26): proje çevrimdışı moduna alır
   * veya online'a döndürür. Yalnız project owner çağırabilir (route guard
   * ile enforce). Desktop kardeş uygulaması bu endpoint'i kullanır; web
   * tarafında henüz UI yok ama backend desteklenir.
   *
   * - offline_mode=true  → flag true, offline_mode_owner_id=callerId,
   *                        offline_mode_set_at=now. Diğer kullanıcıların
   *                        yazma yetkileri DB/middleware seviyesinde kilitlenir.
   * - offline_mode=false → flag false, owner_id NULL, set_at=now.
   *
   * supabaseAdmin RLS bypass eder; route guard owner kontrolünü yapmıştır.
   */
  async setOfflineMode(projeId: string, offline: boolean, callerId: string) {
    const payload: Record<string, any> = {
      offline_mode: offline,
      offline_mode_set_at: new Date().toISOString(),
      offline_mode_owner_id: offline ? callerId : null,
    }

    const { data, error } = await supabaseAdmin
      .from('projeler')
      .update(payload)
      .eq('id', projeId)
      .select('id, proje_adi, offline_mode, offline_mode_owner_id, offline_mode_set_at')
      .single()

    if (error) throw error
    if (!data) throw ApiError.notFound('Proje bulunamadı')
    return data
  },
}
