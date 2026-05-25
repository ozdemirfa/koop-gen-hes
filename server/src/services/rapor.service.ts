import { supabaseAdmin } from '../config/supabase'
import { requireProjeId } from '../utils/projectGuard'
import logger from '../utils/logger'

export const raporService = {
  async dashboardOzet(projeId: string, baslangicTarihi?: string, bitisTarihi?: string) {
    const proje = requireProjeId(projeId)
    // RPC tarih param'larını DATE bekler; null geçilince tüm-zaman davranışı.
    // Boş string'i null'a çeviriyoruz (Postgres date cast hatası vermesin).
    const p_baslangic = baslangicTarihi && baslangicTarihi.trim() !== '' ? baslangicTarihi : null
    const p_bitis = bitisTarihi && bitisTarihi.trim() !== '' ? bitisTarihi : null
    const { data, error } = await supabaseAdmin.rpc('fn_dashboard_ozet', {
      p_proje_id: proje,
      p_baslangic,
      p_bitis,
    });

    if (error) {
      logger.error('fn_dashboard_ozet RPC error', { error, projeId, p_baslangic, p_bitis });
      throw error;
    }

    return data;
  },

  async aidatDurumu(projeId: string) {
    const proje = requireProjeId(projeId)
    const { data, error } = await supabaseAdmin.rpc('fn_aidat_durum_ozet', {
      p_proje_id: proje
    });

    if (error) throw error;

    const result = { bekliyor: 0, odendi: 0, gecikti: 0, iptal: 0, ...data };
    return result;
  },

  async getMizan(projeId: string) {
    const proje = requireProjeId(projeId)
    const { data, error } = await supabaseAdmin
      .rpc('get_cari_mizan', { p_proje_id: proje });

    if (error) throw error;

    return (data || []).map((item: any) => ({
      id: item.cari_hesap_id,
      cari_adi: item.cari_adi,
      cari_turu: item.cari_turu,
      toplam_alacak: Number(item.toplam_alacak || 0),
      toplam_borc: Number(item.toplam_borc || 0),
      bakiye: Number(item.bakiye || 0) // alacak - borc
    }));
  },

  async uyeBorcListesi(projeId: string) {
    const proje = requireProjeId(projeId)
    // 2026-05-15: aidat_detaylari view'ından durum='gecikti' satırları çek; üye
    // bazında geciken borç toplamı, max gecikme günü, ortalama gecikme günü hesapla.
    // Kullanıcı isteğine göre: borçlu üye no, ad soyad, daire blok & no, geciken borç,
    // gecikme süresi, ortalama gecikme süresi.
    const { data: aidatlar, error } = await supabaseAdmin
      .from('aidat_detaylari')
      .select('uye_id, uye_no, ad, soyad, daire_no, blok_adi, kalan_borc, gecikme_gun_sayisi, durum, son_odeme_tarihi')
      .eq('proje_id', proje)
      .eq('durum', 'gecikti')

    if (error) throw error
    if (!aidatlar || aidatlar.length === 0) return []

    type RowAcc = {
      uye_id: string
      uye_no: string
      ad: string
      soyad: string
      daire_no: string | null
      blok_adi: string | null
      geciken_borc: number
      max_gecikme_gun: number
      gecikme_gun_toplam: number
      gecikme_kalem_sayisi: number
    }

    const grouped = new Map<string, RowAcc>()
    for (const a of aidatlar as any[]) {
      if (!a.uye_id) continue
      let acc = grouped.get(a.uye_id)
      if (!acc) {
        acc = {
          uye_id: a.uye_id,
          uye_no: a.uye_no,
          ad: a.ad,
          soyad: a.soyad,
          daire_no: a.daire_no,
          blok_adi: a.blok_adi,
          geciken_borc: 0,
          max_gecikme_gun: 0,
          gecikme_gun_toplam: 0,
          gecikme_kalem_sayisi: 0,
        }
        grouped.set(a.uye_id, acc)
      }
      const kalanBorc = Number(a.kalan_borc || 0)
      const gun = Number(a.gecikme_gun_sayisi || 0)
      acc.geciken_borc += kalanBorc
      acc.max_gecikme_gun = Math.max(acc.max_gecikme_gun, gun)
      acc.gecikme_gun_toplam += gun
      acc.gecikme_kalem_sayisi += 1
    }

    return Array.from(grouped.values())
      .filter(g => g.geciken_borc > 0)
      .sort((a, b) => b.geciken_borc - a.geciken_borc)
      .map(g => ({
        uye_no: g.uye_no,
        ad: g.ad,
        soyad: g.soyad,
        daire: g.blok_adi && g.daire_no ? `${g.blok_adi} - ${g.daire_no}` : (g.daire_no || g.blok_adi || ''),
        blok_adi: g.blok_adi || '',
        daire_no: g.daire_no || '',
        geciken_borc: Math.round(g.geciken_borc * 100) / 100,
        max_gecikme_gun: g.max_gecikme_gun,
        ortalama_gecikme_gun: g.gecikme_kalem_sayisi > 0 ? Math.round(g.gecikme_gun_toplam / g.gecikme_kalem_sayisi) : 0,
        // Geriye uyumluluk için eski alanlar:
        toplam_borc: Math.round(g.geciken_borc * 100) / 100,
        bakiye: Math.round(g.geciken_borc * 100) / 100,
      }))
  },

  async aylikRapor(yil: number, ay: number, projeId: string) {
    const proje = requireProjeId(projeId)

    const { data, error } = await supabaseAdmin.rpc('fn_aylik_rapor_detay', {
      p_proje_id: proje,
      p_yil: yil,
      p_ay: ay
    });

    if (error) {
      logger.error('fn_aylik_rapor_detay RPC error', { error, projeId, yil, ay });
      throw error;
    }

    // 20260525150000: RPC artık hem eski (toplam_gelir, toplam_gider) hem yeni
    // semantik alanları (toplam_tahakkuk, toplam_gider_tahakkuku) döndürüyor.
    // Service shape: yeni alanları öncelikli okur, eski'leri @deprecated olarak
    // korur (B5 sprintinde temizlenecek).
    const tahakkuk = Number(data.toplam_tahakkuk ?? data.toplam_gelir ?? 0)
    const giderTahakkuku = Number(data.toplam_gider_tahakkuku ?? data.toplam_gider ?? 0)
    const tahsilat = Number(data.toplam_tahsilat || 0)
    const odeme = Number(data.toplam_odeme || 0)

    return {
      donem: { yil, ay },
      gelirler: data.gelirler || [],
      giderler: data.giderler || [],
      tahsilatlar: data.tahsilatlar || [],
      aidat_tahsilat: data.tahsilatlar || [], // Frontend compatibility
      odemeler: data.odemeler || [],
      // YENİ semantik alanlar
      toplam_tahakkuk: tahakkuk,
      toplam_gider_tahakkuku: giderTahakkuku,
      // @deprecated 20260525150000 — B5 sprintinde silinecek; tüketici toplam_tahakkuk/toplam_gider_tahakkuku kullanmalı.
      toplam_gelir: tahakkuk,
      toplam_gider: giderTahakkuku,
      toplam_tahsilat: tahsilat,
      toplam_aidat_tahsilat: tahsilat,
      toplam_odeme: odeme,
      yaklasan_odemeler: { t: 0, t1: 0, t2: 0 }
    };
  },

  async yillikRapor(yil: number, projeId: string) {
    const proje = requireProjeId(projeId)
    const { data, error } = await supabaseAdmin.rpc('fn_yillik_rapor_ozet', {
      p_proje_id: proje,
      p_yil: yil
    });

    if (error) {
      logger.error('fn_yillik_rapor_ozet RPC error', { error, projeId, yil });
      throw error;
    }

    // 2026-05-15: Aylık dataset'e aidatlar tablosundan ay bazlı geciken alacak +
    // ortalama gecikme günü ekle. RPC'yi yeniden yazmak yerine service-katmanı
    // enrichment (basit + test edilebilir).
    const { data: aidatlar } = await supabaseAdmin
      .from('aidat_detaylari')
      .select('ay, durum, kalan_borc, gecikme_gun_sayisi')
      .eq('proje_id', proje)
      .eq('yil', yil)
      .eq('durum', 'gecikti')

    const monthlyMap = new Map<number, { geciken_alacak: number; gecikme_gun_toplam: number; count: number }>()
    for (const a of (aidatlar || []) as any[]) {
      const m = Number(a.ay)
      if (!m) continue
      const stats = monthlyMap.get(m) ?? { geciken_alacak: 0, gecikme_gun_toplam: 0, count: 0 }
      stats.geciken_alacak += Number(a.kalan_borc || 0)
      stats.gecikme_gun_toplam += Number(a.gecikme_gun_sayisi || 0)
      stats.count += 1
      monthlyMap.set(m, stats)
    }

    // 20260525150000: RPC her aylik satırına hem eski (gelir, gider) hem yeni
    // semantik alanları (tahakkuk, gider_tahakkuku) ekliyor. Service enrichment'ı
    // yeni alanları öncelikli korur; eski'leri RPC zaten yazıyor.
    const aylikEnriched = ((data?.aylik) || []).map((row: any) => {
      const m = Number(row.ay)
      const stats = monthlyMap.get(m)
      const tahakkuk = Number(row.tahakkuk ?? row.gelir ?? 0)
      const giderTahakkuku = Number(row.gider_tahakkuku ?? row.gider ?? 0)
      return {
        ...row,
        // YENİ semantik alanlar (RPC zaten yazıyor; tutarlılık için garantiliyoruz)
        tahakkuk,
        gider_tahakkuku: giderTahakkuku,
        // @deprecated B5 sprintinde silinecek
        gelir: tahakkuk,
        gider: giderTahakkuku,
        geciken_alacak: stats ? Math.round(stats.geciken_alacak * 100) / 100 : 0,
        ortalama_gecikme_gun: stats && stats.count > 0 ? Math.round(stats.gecikme_gun_toplam / stats.count) : 0,
      }
    })

    // Top-level toplam_tahakkuk / toplam_gider_tahakkuku alanlarını da garantile
    // (RPC zaten yazıyor; data spread'i sonrası ek alias).
    const topTahakkuk = Number(data?.toplam_tahakkuk ?? data?.toplam_gelir ?? 0)
    const topGiderTahakkuku = Number(data?.toplam_gider_tahakkuku ?? data?.toplam_gider ?? 0)

    return {
      ...data,
      // YENİ semantik alanlar (öncelikli)
      toplam_tahakkuk: topTahakkuk,
      toplam_gider_tahakkuku: topGiderTahakkuku,
      // @deprecated B5 sprintinde silinecek
      toplam_gelir: topTahakkuk,
      toplam_gider: topGiderTahakkuku,
      aylik: aylikEnriched,
    }
  },

  async hakedisOzet(projeId: string) {
    const proje = requireProjeId(projeId)
    const { data, error } = await supabaseAdmin
      .from('hakedisler')
      .select('durum, ara_toplam, hakedis_toplam, net_tutar, sozlesmeler(sozlesme_no, firmalar(unvan))')
      .eq('proje_id', proje)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const ozet = {
      toplam_hakedis_sayisi: data?.length || 0,
      taslak: 0,
      onaylanan: 0,
      odenen: 0,
      toplam_matrah: 0,
      toplam_kdvli: 0,
      toplam_net: 0
    };

    data?.forEach(h => {
      ozet.toplam_matrah += Number(h.ara_toplam || 0);
      ozet.toplam_kdvli += Number(h.hakedis_toplam || 0);
      ozet.toplam_net += Number(h.net_tutar || 0);
      if (h.durum === 'taslak') ozet.taslak++;
      if (h.durum === 'onaylandi') ozet.onaylanan++;
      if (h.durum === 'odendi') ozet.odenen++;
    });

    return { ozet, hakedisler: data };
  }
}
