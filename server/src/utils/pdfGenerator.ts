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
            widths: ['auto', '*', 'auto', 'auto', 'auto'],
            body: [
              [
                { text: 'Poz No', style: 'tableHeader' },
                { text: 'İş Kalemi', style: 'tableHeader' },
                { text: 'Birim', style: 'tableHeader' },
                { text: 'Bu Ay Miktar', style: 'tableHeader', alignment: 'right' },
                { text: 'Tutar (TL)', style: 'tableHeader', alignment: 'right' }
              ],
              ...kalemler.map((k: any) => [
                k.sozlesme_is_kalemleri?.poz_no || '-',
                k.sozlesme_is_kalemleri?.tanim || '-',
                k.sozlesme_is_kalemleri?.birim || '-',
                { text: k.bu_ay_miktar.toLocaleString('tr-TR'), alignment: 'right' },
                { text: k.bu_ay_tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 }), alignment: 'right' }
              ])
            ]
          },
          layout: 'lightHorizontalLines'
        },
        {
          margin: [0, 20, 0, 0],
          table: {
            widths: ['*', 'auto'],
            body: [
              ['BRÜT TUTAR', { text: hakedis.toplam_tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 }), bold: true, alignment: 'right' }],
              ['TEMİNAT KESİNTİSİ (%)', { text: hakedis.teminat_kesintisi.toLocaleString('tr-TR', { minimumFractionDigits: 2 }), alignment: 'right' }],
              ['STOPAJ KESİNTİSİ (%)', { text: hakedis.stopaj_kesintisi.toLocaleString('tr-TR', { minimumFractionDigits: 2 }), alignment: 'right' }],
              ['DİĞER KESİNTİLER', { text: hakedis.diger_kesintiler.toLocaleString('tr-TR', { minimumFractionDigits: 2 }), alignment: 'right' }],
              [{ text: 'NET ÖDENECEK TUTAR', bold: true }, { text: hakedis.net_tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 }), bold: true, alignment: 'right', fontSize: 14 }]
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
   * Mali rapor (Gelir/Gider) için PDF dökümanı oluşturur.
   */
  generateMaliRaporPDF(raporData: any): any {
    const { donem, gelirler, giderler, toplam_gelir, toplam_gider, toplam_aidat_tahsilat } = raporData
    
    return {
      content: [
        { text: `${donem.yil} / ${donem.ay} DÖNEMİ MALİ RAPORU`, style: 'header', alignment: 'center' },
        { text: 'GELİRLER', style: 'subheader', margin: [0, 20, 0, 5] },
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', 'auto'],
            body: [
              [{ text: 'Tarih', style: 'tableHeader' }, { text: 'Açıklama / Kategori', style: 'tableHeader' }, { text: 'Tutar (TL)', style: 'tableHeader', alignment: 'right' }],
              ...gelirler.map((g: any) => [
                new Date(g.tarih).toLocaleDateString('tr-TR'),
                `${g.gelir_gider_kategorileri?.ad || '-'} - ${g.aciklama || ''}`,
                { text: g.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 }), alignment: 'right' }
              ]),
              [{ text: 'Aidat Tahsilatları Toplamı', colSpan: 2, bold: true }, {}, { text: toplam_aidat_tahsilat.toLocaleString('tr-TR', { minimumFractionDigits: 2 }), bold: true, alignment: 'right' }],
              [{ text: 'GELİRLER TOPLAMI', colSpan: 2, bold: true, fillColor: '#e6ffed' }, {}, { text: (toplam_gelir + toplam_aidat_tahsilat).toLocaleString('tr-TR', { minimumFractionDigits: 2 }), bold: true, alignment: 'right', fillColor: '#e6ffed' }]
            ]
          }
        },
        { text: 'GİDERLER', style: 'subheader', margin: [0, 20, 0, 5] },
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', 'auto'],
            body: [
              [{ text: 'Tarih', style: 'tableHeader' }, { text: 'Açıklama / Kategori', style: 'tableHeader' }, { text: 'Tutar (TL)', style: 'tableHeader', alignment: 'right' }],
              ...giderler.map((g: any) => [
                new Date(g.tarih).toLocaleDateString('tr-TR'),
                `${g.gelir_gider_kategorileri?.ad || '-'} - ${g.aciklama || ''}`,
                { text: g.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 }), alignment: 'right' }
              ]),
              [{ text: 'GİDERLER TOPLAMI', colSpan: 2, bold: true, fillColor: '#fff1f0' }, {}, { text: toplam_gider.toLocaleString('tr-TR', { minimumFractionDigits: 2 }), bold: true, alignment: 'right', fillColor: '#fff1f0' }]
            ]
          }
        },
        {
          margin: [0, 30, 0, 0],
          table: {
            widths: ['*', 'auto'],
            body: [
              [{ text: 'DÖNEM NET BAKİYE (KASA/BANKA)', bold: true, fontSize: 14 }, { text: (toplam_gelir + toplam_aidat_tahsilat - toplam_gider).toLocaleString('tr-TR', { minimumFractionDigits: 2 }), bold: true, fontSize: 14, alignment: 'right' }]
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
