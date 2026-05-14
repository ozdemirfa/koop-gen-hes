import { supabaseAdmin } from '../config/supabase'
import logger from '../utils/logger'

export const raporService = {
  async dashboardOzet(projeId: string) {
    const { data, error } = await supabaseAdmin.rpc('fn_dashboard_ozet', {
      p_proje_id: projeId
    });

    if (error) {
      logger.error('fn_dashboard_ozet RPC error', { error, projeId });
      throw error;
    }

    return data;
  },

  async aidatDurumu(projeId: string) {
    const { data, error } = await supabaseAdmin.rpc('fn_aidat_durum_ozet', {
      p_proje_id: projeId
    });

    if (error) throw error;

    const result = { bekliyor: 0, odendi: 0, gecikti: 0, iptal: 0, ...data };
    return result;
  },

  async getMizan(projeId: string) {
    const { data, error } = await supabaseAdmin
      .rpc('get_cari_mizan', { p_proje_id: projeId });

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
    // 2026-05-15: aidat_detaylari view'ından durum='gecikti' satırları çek; üye
    // bazında geciken borç toplamı, max gecikme günü, ortalama gecikme günü hesapla.
    // Kullanıcı isteğine göre: borçlu üye no, ad soyad, daire blok & no, geciken borç,
    // gecikme süresi, ortalama gecikme süresi.
    const { data: aidatlar, error } = await supabaseAdmin
      .from('aidat_detaylari')
      .select('uye_id, uye_no, ad, soyad, daire_no, blok_adi, kalan_borc, gecikme_gun_sayisi, durum, son_odeme_tarihi')
      .eq('proje_id', projeId)
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
    if (!projeId || projeId === 'undefined') {
      throw new Error('Proje ID zorunludur');
    }

    const { data, error } = await supabaseAdmin.rpc('fn_aylik_rapor_detay', {
      p_proje_id: projeId,
      p_yil: yil,
      p_ay: ay
    });

    if (error) {
      logger.error('fn_aylik_rapor_detay RPC error', { error, projeId, yil, ay });
      throw error;
    }

    return {
      donem: { yil, ay },
      gelirler: data.gelirler || [],
      giderler: data.giderler || [],
      tahsilatlar: data.tahsilatlar || [],
      aidat_tahsilat: data.tahsilatlar || [], // Frontend compatibility
      odemeler: data.odemeler || [],
      toplam_gelir: Number(data.toplam_gelir || 0),
      toplam_gider: Number(data.toplam_gider || 0),
      toplam_tahsilat: Number(data.toplam_tahsilat || 0),
      toplam_aidat_tahsilat: Number(data.toplam_tahsilat || 0),
      toplam_odeme: Number(data.toplam_odeme || 0),
      yaklasan_odemeler: { t: 0, t1: 0, t2: 0 }
    };
  },

  async yillikRapor(yil: number, projeId: string) {
    const { data, error } = await supabaseAdmin.rpc('fn_yillik_rapor_ozet', {
      p_proje_id: projeId,
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
      .eq('proje_id', projeId)
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

    const aylikEnriched = ((data?.aylik) || []).map((row: any) => {
      const m = Number(row.ay)
      const stats = monthlyMap.get(m)
      return {
        ...row,
        geciken_alacak: stats ? Math.round(stats.geciken_alacak * 100) / 100 : 0,
        ortalama_gecikme_gun: stats && stats.count > 0 ? Math.round(stats.gecikme_gun_toplam / stats.count) : 0,
      }
    })

    return {
      ...data,
      aylik: aylikEnriched,
    }
  },

  async hakedisOzet(projeId: string) {
    const { data, error } = await supabaseAdmin
      .from('hakedisler')
      .select('durum, ara_toplam, hakedis_toplam, net_tutar, sozlesmeler(sozlesme_no, firmalar(unvan))')
      .eq('proje_id', projeId)
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
