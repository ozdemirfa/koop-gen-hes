// @ts-ignore
import type { TDocumentDefinitions, TFontDictionary } from 'pdfmake'

// pdfmake interfaces eksikliği durumunda any'ye düşür
type DocDef = any;
type FontDict = any;

// Server-side PDF generation için fontların path'ini düzeltmemiz gerekiyor. 
// Standart Roboto fontlarını kullanmak en güvenlisidir.
const standardFonts: any = {
  Roboto: {
    normal: 'Helvetica', 
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique'
  }
}

/**
 * pdfmake Printer instance'ını güvenli bir şekilde oluşturur.
 * Kütüphane yapısı gereği (CJS/ESM interop) bazen direkt bazen .default altında bulunur.
 */
const getPrinter = () => {
  const PdfPrinter = require('pdfmake');
  const PrinterConstructor = typeof PdfPrinter === 'function' ? PdfPrinter : PdfPrinter.default;
  return new PrinterConstructor(standardFonts);
};

export const pdfGenerator = {
  /**
   * Bir hakediş için PDF dökümanı oluşturur.
   */
  generateHakedisPDF(hakedisData: any): any {
    const { hakedis, kalemler, sozlesme, firma } = hakedisData

    return {
      content: [
        { text: 'HAKEDİŞ RAPORU', style: 'header', alignment: 'center' },
        { text: `Hakediş No: ${hakedis.hakedis_no || '-'}`, style: 'subheader' },
        {
          columns: [
            {
              width: '*',
              text: [
                { text: 'Firma: ', bold: true }, `${firma.unvan}\n`,
                { text: 'Sözleşme: ', bold: true }, `${sozlesme.sozlesme_no} - ${sozlesme.konu}\n`,
                { text: 'Tarih: ', bold: true }, `${new Date(hakedis.hakedis_tarihi).toLocaleDateString('tr-TR')}\n`,
              ]
            },
            {
              width: 'auto',
              text: [
                { text: 'Durum: ', bold: true }, `${hakedis.durum.toUpperCase()}\n`,
              ]
            }
          ],
          margin: [0, 20, 0, 20]
        },
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto'],
            body: [
              [
                { text: 'Poz No', style: 'tableHeader' },
                { text: 'İş Kalemi', style: 'tableHeader' },
                { text: 'Birim', style: 'tableHeader' },
                { text: 'Miktar', style: 'tableHeader', alignment: 'right' },
                { text: 'B.Fiyat', style: 'tableHeader', alignment: 'right' },
                { text: 'KDV (%)', style: 'tableHeader', alignment: 'right' },
                { text: 'Tutar (TL)', style: 'tableHeader', alignment: 'right' }
              ],
              ...kalemler.map((k: any) => {
                const tutar = Number(k.bu_ay_miktar) * Number(k.birim_fiyat);
                const kdvliTutar = tutar * (1 + Number(k.kdv_orani || 0) / 100);
                return [
                  k.sozlesme_is_kalemleri?.poz_no || '-',
                  k.sozlesme_is_kalemleri?.tanim || '-',
                  k.sozlesme_is_kalemleri?.birim || '-',
                  { text: k.bu_ay_miktar.toLocaleString('tr-TR'), alignment: 'right' },
                  { text: k.birim_fiyat.toLocaleString('tr-TR', { minimumFractionDigits: 2 }), alignment: 'right' },
                  { text: `%${k.kdv_orani || 0}`, alignment: 'right' },
                  { text: kdvliTutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 }), alignment: 'right' }
                ];
              })
            ]
          },
          layout: 'lightHorizontalLines'
        },
        {
          margin: [0, 20, 0, 0],
          table: {
            widths: ['*', 'auto'],
            body: [
              ['ARA TOPLAM', { text: (hakedis.ara_toplam || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 }), bold: true, alignment: 'right' }],
              ['KDV TOPLAM', { text: (hakedis.kdv_tutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 }), alignment: 'right' }],
              ['HAKEDİŞ TOPLAM (KDV DAHİL)', { text: (hakedis.hakedis_toplam || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 }), bold: true, alignment: 'right' }],
              ['TEMİNAT KESİNTİSİ', { text: (hakedis.teminat_kesintisi || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 }), alignment: 'right' }],
              ['STOPAJ KESİNTİSİ', { text: (hakedis.stopaj_kesintisi || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 }), alignment: 'right' }],
              ['DİĞER KESİNTİLER', { text: (hakedis.diger_kesintiler || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 }), alignment: 'right' }],
              [{ text: 'NET ÖDENECEK TUTAR', bold: true }, { text: (hakedis.net_tutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 }), bold: true, alignment: 'right', fontSize: 14 }]
            ]
          },
          layout: 'noBorders'
        }
      ],
      styles: {
        header: { fontSize: 18, bold: true, marginBottom: 10 },
        subheader: { fontSize: 14, bold: true, marginBottom: 5 },
        tableHeader: { bold: true, fontSize: 11, color: 'black', fillColor: '#f0f0f0' }
      },
      defaultStyle: { fontSize: 10 }
    }
  },

  /**
   * Mali rapor (Tahakkuk/Gider) için PDF dökümanı oluşturur.
   *
   * 20260525150000: rapor.service yeni semantik alanlar döndürüyor —
   *   toplam_tahakkuk (eski: toplam_gelir), toplam_gider_tahakkuku (eski: toplam_gider).
   *   Eski alanlardan fallback ile geriye uyumluluk korunur.
   *
   * 20260525160000: RPC formul revizyonu sonrasi `gelirler` listesi artik
   *   uyelik_baslangic tahakkukunu, `giderler` listesi artik iade_odeme'yi
   *   icerebilir. PDF'te islem_turu metni Turkce etiketle gosterilir.
   *
   *   iade_odeme `alacak` ile kaydedildigi icin tutar hucresi borc yerine
   *   alacak'tan okunur (conditional).
   */
  generateMaliRaporPDF(raporData: any): any {
    const { donem, gelirler, giderler, toplam_aidat_tahsilat } = raporData
    // YENİ semantik alanları öncelikli okur; eski alias'a fallback.
    const toplam_tahakkuk: number = Number(raporData.toplam_tahakkuk ?? raporData.toplam_gelir ?? 0)
    const toplam_gider_tahakkuku: number = Number(raporData.toplam_gider_tahakkuku ?? raporData.toplam_gider ?? 0)

    // 20260525160000: islem_turu → kullanici etiketi (PDF + Turkce + tutarli)
    const islemTuruEtiket = (turu: string): string => {
      switch (turu) {
        case 'aidat_kayit': return 'Aidat Tahakkuku'
        case 'gecikme_faizi': return 'Gecikme Faizi'
        case 'uyelik_baslangic': return 'Üyelik Başlangıç Bedeli'
        case 'hakedis': return 'Hakediş'
        case 'iade_odeme': return 'Üyelik Bedeli İadesi'
        case 'fatura': return 'Fatura'
        case 'gelen_odeme': return 'Tahsilat'
        case 'giden_odeme': return 'Ödeme'
        default: return turu || '-'
      }
    }

    return {
      content: [
        { text: `${donem.yil} / ${donem.ay} DÖNEMİ MALİ RAPORU`, style: 'header', alignment: 'center' },
        { text: 'TAHAKKUKLAR', style: 'subheader', margin: [0, 20, 0, 5] },
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', 'auto'],
            body: [
              [{ text: 'Tarih', style: 'tableHeader' }, { text: 'Açıklama / Kategori', style: 'tableHeader' }, { text: 'Tutar (TL)', style: 'tableHeader', alignment: 'right' }],
              ...gelirler.map((g: any) => [
                new Date(g.tarih).toLocaleDateString('tr-TR'),
                `${islemTuruEtiket(g.islem_turu)} - ${g.aciklama || ''}`,
                { text: Number(g.alacak ?? g.tutar ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 }), alignment: 'right' }
              ]),
              [{ text: 'Aidat Tahsilatları Toplamı', colSpan: 2, bold: true }, {}, { text: toplam_aidat_tahsilat.toLocaleString('tr-TR', { minimumFractionDigits: 2 }), bold: true, alignment: 'right' }],
              [{ text: 'TAHAKKUK + TAHSİLAT TOPLAMI', colSpan: 2, bold: true, fillColor: '#e6ffed' }, {}, { text: (toplam_tahakkuk + toplam_aidat_tahsilat).toLocaleString('tr-TR', { minimumFractionDigits: 2 }), bold: true, alignment: 'right', fillColor: '#e6ffed' }]
            ]
          }
        },
        { text: 'GİDER TAHAKKUKLARI', style: 'subheader', margin: [0, 20, 0, 5] },
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', 'auto'],
            body: [
              [{ text: 'Tarih', style: 'tableHeader' }, { text: 'Açıklama / Kategori', style: 'tableHeader' }, { text: 'Tutar (TL)', style: 'tableHeader', alignment: 'right' }],
              ...giderler.map((g: any) => {
                // iade_odeme alacak ile kaydedilir; hakedis borc ile. Tutar yon-bilincli.
                const tutar = Number(
                  g.islem_turu === 'iade_odeme'
                    ? (g.alacak ?? 0)
                    : (g.borc ?? g.tutar ?? 0)
                )
                return [
                  new Date(g.tarih).toLocaleDateString('tr-TR'),
                  `${islemTuruEtiket(g.islem_turu)} - ${g.aciklama || ''}`,
                  { text: tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 }), alignment: 'right' }
                ]
              }),
              [{ text: 'GİDER TAHAKKUKU TOPLAMI', colSpan: 2, bold: true, fillColor: '#fff1f0' }, {}, { text: toplam_gider_tahakkuku.toLocaleString('tr-TR', { minimumFractionDigits: 2 }), bold: true, alignment: 'right', fillColor: '#fff1f0' }]
            ]
          }
        },
        {
          margin: [0, 30, 0, 0],
          table: {
            widths: ['*', 'auto'],
            body: [
              [{ text: 'DÖNEM NET BAKİYE (KASA/BANKA)', bold: true, fontSize: 14 }, { text: (toplam_tahakkuk + toplam_aidat_tahsilat - toplam_gider_tahakkuku).toLocaleString('tr-TR', { minimumFractionDigits: 2 }), bold: true, fontSize: 14, alignment: 'right' }]
            ]
          }
        }
      ],
      styles: {
        header: { fontSize: 18, bold: true, marginBottom: 10 },
        subheader: { fontSize: 14, bold: true, marginBottom: 5, color: '#1677ff' },
        tableHeader: { bold: true, fontSize: 10, fillColor: '#f5f5f5' }
      },
      defaultStyle: { fontSize: 9 }
    }
  },

  /**
   * Dökümanı PDF Stream olarak döndürür.
   */
  createPdfStream(docDefinition: any) {
    const printer = getPrinter();
    return printer.createPdfKitDocument(docDefinition)
  }
}
