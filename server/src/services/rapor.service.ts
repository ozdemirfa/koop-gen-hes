import { supabaseAdmin } from '../config/supabase'

export const raporService = {
  async dashboardOzet(projeId: string) {
    try {
      const { data: proje } = await supabaseAdmin
        .from('projeler')
        .select('baslangic_tarihi')
        .eq('id', projeId)
        .single();

      // 1. Proje bazlı tüm hareketleri çek (Join ile cari türünü al)
      const { data: hareketler, error: hError } = await supabaseAdmin
        .from('cari_hareketler')
        .select(`
          islem_turu, 
          borc, 
          alacak, 
          cari_hesap_id, 
          odeme_turu, 
          cari_hesaplar!inner(cari_turu)
        `)
        .eq('proje_id', projeId);

      if (hError) throw hError;

      // 2. Hakedişler üzerinden Gerçek Tahakkuk Eden Gider (KDVli) - Referans için tutuluyor
      const { data: dbHakedisler } = await supabaseAdmin
        .from('hakedisler')
        .select('hakedis_toplam, ara_toplam, kdv_tutar, teminat_kesintisi')
        .eq('proje_id', projeId)
        .in('durum', ['onaylandi', 'odendi']);

      const hakedis_toplam_gider = dbHakedisler?.reduce((s, h) => s + Number(h.hakedis_toplam || (Number(h.ara_toplam || 0) + Number(h.kdv_tutar || 0))), 0) || 0;
      const birikmis_teminat = dbHakedisler?.reduce((acc, h) => acc + Number(h.teminat_kesintisi || 0), 0) || 0;

      // 3. Toplamları Hesapla
      let toplam_gelir = 0;
      let toplam_tahsilat = 0;
      let toplam_odeme = 0;
      let kasa_borc = 0;
      let kasa_alacak = 0;
      let firma_toplam_alacak = 0;
      let firma_toplam_borc = 0;

      const balances: Record<string, { bakiye: number; tur: string }> = {};

      hareketler?.forEach(h => {
        const borc = Number(h.borc || 0);
        const alacak = Number(h.alacak || 0);
        const tur = (h.cari_hesaplar as any)?.cari_turu;

        if (tur === 'uye') {
          if (h.islem_turu === 'aidat_kayit') toplam_gelir += alacak;
          if (h.islem_turu === 'gelen_odeme') toplam_tahsilat += borc;
        } else if (tur === 'firma') {
          // Cari Bakiye için ham kolon toplamları (Kesin Kural: Alacak - Borç)
          firma_toplam_alacak += alacak;
          firma_toplam_borc += borc;
          
          // Yapılan gerçek ödemeler (Giden ödeme satırları)
          if (h.islem_turu === 'giden_odeme' || h.islem_turu === 'odeme') {
            toplam_odeme += alacak;
          }
        }

        // Kasa Nakit: Nakit işlemlerin borç-alacak farkı
        if (h.odeme_turu?.toLowerCase() === 'nakit') {
          kasa_borc += borc;
          kasa_alacak += alacak;
        }

        if (h.cari_hesap_id) {
          if (!balances[h.cari_hesap_id]) {
            balances[h.cari_hesap_id] = { bakiye: 0, tur };
          }
          balances[h.cari_hesap_id].bakiye += (alacak - borc);
        }
      });

      const kasa_nakit = kasa_borc - kasa_alacak;
      const cari_bakiye = firma_toplam_alacak - firma_toplam_borc; 
      const toplam_gider = hakedis_toplam_gider; 


      let bekleyen_alacak = 0;
      let bekleyen_borc = 0;
      Object.values(balances).forEach(b => {
        if (b.tur === 'uye' && b.bakiye > 0) bekleyen_alacak += b.bakiye;
        if (b.tur === 'firma' && b.bakiye < 0) bekleyen_borc += Math.abs(b.bakiye);
      });

      const { count: uyeSayisi } = await supabaseAdmin
        .from('uyeler')
        .select('*', { count: 'exact', head: true })
        .eq('proje_id', projeId)
        .eq('durum', 'aktif');

      // Toplam Daire Sayısı
      const { data: bloklar } = await supabaseAdmin
        .from('bloklar')
        .select('toplam_daire')
        .eq('proje_id', projeId);
      const toplam_daire_sayisi = bloklar?.reduce((acc, b) => acc + (b.toplam_daire || 0), 0) || 0;

      // Faturalar (Gelen faturalar toplamı)
      const { data: faturalar } = await supabaseAdmin
        .from('faturalar')
        .select('toplam_tutar')
        .eq('proje_id', projeId)
        .eq('fatura_tipi', 'gelen');
      const toplam_fatura = faturalar?.reduce((acc, f) => acc + Number(f.toplam_tutar || 0), 0) || 0;

      // Çekler (Bekleyen çekler toplamı)
      const { data: cekler } = await supabaseAdmin
        .from('cekler')
        .select('tutar')
        .eq('proje_id', projeId)
        .eq('durum', 'beklemede');
      const cek_toplami = cekler?.reduce((acc, c) => acc + Number(c.tutar || 0), 0) || 0;

      // Çekler (Bekleyen çekler toplamı)
      // Gecikme Faiz Tahsilatı
      const { data: aidatlar } = await supabaseAdmin
        .from('aidatlar')
        .select('gecikme_faizi')
        .eq('proje_id', projeId)
        .eq('durum', 'odendi')
        .eq('faiz_yansitildi', true);
      const gecikme_faiz_tahsilati = aidatlar?.reduce((acc, a) => acc + Number(a.gecikme_faizi || 0), 0) || 0;
      // Banka Bakiyeleri
      const { data: bankaHareketleri } = await supabaseAdmin
        .from('banka_hareketleri')
        .select('tutar, islem_tipi, banka_hesaplari!inner(proje_id)')
        .eq('banka_hesaplari.proje_id', projeId);

      let banka_toplami = 0;
      bankaHareketleri?.forEach(bh => {
        if (bh.islem_tipi === 'gelir') banka_toplami += Number(bh.tutar || 0);
        else banka_toplami -= Number(bh.tutar || 0);
      });

      // Proje Süresi Hesaplama
      let proje_suresi = { ay: 0, gun: 0 };
      if (proje?.baslangic_tarihi) {
        const start = new Date(proje.baslangic_tarihi);
        const now = new Date();
        let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
        let days = now.getDate() - start.getDate();
        if (days < 0) {
          months -= 1;
          const lastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
          days += lastMonth.getDate();
        }
        proje_suresi = { ay: months, gun: days };
      }

      return {
        toplam_gelir,
        toplam_gider,
        toplam_tahsilat,
        toplam_odeme,
        toplam_fatura,
        fatura_farki: toplam_fatura - toplam_gider,
        kasa_banka: banka_toplami,
        kasa_nakit,
        kasa_borc,
        kasa_alacak,
        bekleyen_alacak,
        bekleyen_borc,
        aktif_uye_sayisi: uyeSayisi || 0,
        toplam_daire_sayisi,
        cari_bakiye,
        cek_toplami,
        birikmis_teminat,
        gecikme_faiz_tahsilati,
        banka_toplami,
        proje_suresi,
        odeme_sonrasi_nakit: banka_toplami + kasa_nakit + (cari_bakiye < 0 ? cari_bakiye : 0) - cek_toplami - birikmis_teminat
      };
    } catch (err) {
      console.error('Fatal error in dashboardOzet:', err);
      throw err;
    }
  },

  async aylikGelirGider(projeId: string, yil?: number) {
    const targetYil = yil || new Date().getFullYear();

    const { data, error } = await supabaseAdmin
      .from('cari_hareketler')
      .select('islem_turu, alacak, borc, tarih')
      .eq('proje_id', projeId)
      .in('islem_turu', ['aidat_kayit', 'hakedis'])
      .gte('tarih', `${targetYil}-01-01`)
      .lte('tarih', `${targetYil}-12-31`);

    if (error) throw error;

    const aylik: Record<number, { gelir: number; gider: number }> = {};
    for (let ay = 1; ay <= 12; ay++) {
      aylik[ay] = { gelir: 0, gider: 0 };
    }

    data?.forEach(item => {
      const date = new Date(item.tarih);
      const ay = date.getMonth() + 1;
      if (item.islem_turu === 'aidat_kayit') aylik[ay].gelir += Number(item.alacak || 0);
      if (item.islem_turu === 'hakedis') aylik[ay].gider += Number(item.borc || 0);
    });

    return Object.entries(aylik).map(([ay, values]) => ({
      ay: parseInt(ay),
      ...values
    }));
  },

  async aidatDurumu(projeId: string) {
    const { data, error } = await supabaseAdmin
      .from('aidatlar')
      .select('durum')
      .eq('proje_id', projeId);

    if (error) throw error;

    const durum: Record<string, number> = { bekliyor: 0, odendi: 0, gecikti: 0, iptal: 0 };
    data?.forEach(a => { durum[a.durum] = (durum[a.durum] || 0) + 1 });

    return durum;
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
    const { data, error } = await supabaseAdmin
      .from('cari_hesaplar')
      .select(`
        id,
        cari_adi,
        uye_id,
        uyeler!uye_id (uye_no, ad, soyad),
        cari_hareketler (alacak, borc)
      `)
      .eq('proje_id', projeId)
      .eq('cari_turu', 'uye');

    if (error) throw error;

    return (data || []).map(item => {
      const hareketler = (item.cari_hareketler as any[]) || [];
      let toplamBorc = 0;
      let toplamAlacak = 0;

      hareketler.forEach(h => {
        toplamAlacak += Number(h.alacak || 0);
        toplamBorc += Number(h.borc || 0);
      });

      const bakiye = toplamAlacak - toplamBorc;

      return {
        uye_no: (item.uyeler as any)?.uye_no,
        ad: (item.uyeler as any)?.ad,
        soyad: (item.uyeler as any)?.soyad,
        toplam_borc: bakiye,
        bakiye: bakiye
      };
    }).filter(u => u.bakiye > 0);
  },

  async aylikRapor(yil: number, ay: number, projeId: string) {
    try {
      if (!projeId || projeId === 'undefined') {
        throw new Error('Proje ID zorunludur');
      }

      const baslangic = `${yil}-${String(ay).padStart(2, '0')}-01`;
      const lastDay = new Date(yil, ay, 0).getDate();
      const bitis = `${yil}-${String(ay).padStart(2, '0')}-${lastDay}`;

      const { data: hareketler, error } = await supabaseAdmin
        .from('cari_hareketler')
        .select('*, cari_hesaplar(cari_adi)')
        .eq('proje_id', projeId)
        .gte('tarih', baslangic)
        .lte('tarih', bitis)
        .order('tarih');

      if (error) {
        console.error('Aylık rapor sorgu hatası:', error);
        throw error;
      }

      const data = hareketler || [];
      
      // Gelir: aidat_kayit alacak
      const gelirler = data.filter(h => h.islem_turu === 'aidat_kayit');
      // Gider: hakedis veya fatura borc
      const giderler = data.filter(h => h.islem_turu === 'hakedis' || h.islem_turu === 'fatura');
      // Tahsilat: gelen_odeme borc
      const tahsilatlar = data.filter(h => h.islem_turu === 'gelen_odeme');
      // Odeme: giden_odeme alacak
      const odemeler = data.filter(h => h.islem_turu === 'giden_odeme');

      return {
        donem: { yil, ay },
        gelirler,
        giderler,
        tahsilatlar,
        aidat_tahsilat: tahsilatlar, // Frontend compatibility
        odemeler,
        toplam_gelir: gelirler.reduce((s, r) => s + Number(r.alacak || 0), 0),
        toplam_gider: giderler.reduce((s, r) => s + Number(r.borc || 0), 0),
        toplam_tahsilat: tahsilatlar.reduce((s, r) => s + Number(r.borc || 0), 0),
        toplam_aidat_tahsilat: tahsilatlar.reduce((s, r) => s + Number(r.borc || 0), 0),
        toplam_odeme: odemeler.reduce((s, r) => s + Number(r.alacak || 0), 0),
        yaklasan_odemeler: { t: 0, t1: 0, t2: 0 }
      };
    } catch (err) {
      console.error('Fatal error in aylikRapor:', err);
      throw err;
    }
  },

  async yillikRapor(yil: number, projeId: string) {
    const aylikVeriler = [];
    for (let ay = 1; ay <= 12; ay++) {
      const rapor = await this.aylikRapor(yil, ay, projeId);
      aylikVeriler.push({
        ay,
        gelir: rapor.toplam_gelir,
        gider: rapor.toplam_gider,
        tahsilat: rapor.toplam_tahsilat,
        odeme: rapor.toplam_odeme
      });
    }

    return {
      yil,
      aylik: aylikVeriler,
      toplam_gelir: aylikVeriler.reduce((s, a) => s + a.gelir, 0),
      toplam_gider: aylikVeriler.reduce((s, a) => s + a.gider, 0),
      toplam_tahsilat: aylikVeriler.reduce((s, a) => s + a.tahsilat, 0),
      toplam_odeme: aylikVeriler.reduce((s, a) => s + a.odeme, 0)
    };
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
