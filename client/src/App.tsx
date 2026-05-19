import React, { Suspense, lazy } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider, App as AntdApp, Spin } from 'antd'
import trTR from 'antd/locale/tr_TR'

import { AuthProvider } from './contexts/AuthContext'
import { ProjectProvider } from './contexts/ProjectContext'
import { LayoutProvider } from './contexts/LayoutContext'
import { AdminLayout } from './components/AdminLayout'
import { ProtectedRoute } from './components/common/ProtectedRoute'
import { ErrorBoundary } from './components/common/ErrorBoundary'

// Sprint 20260520-perf — Route-level code splitting (PR1):
// Sayfalar `React.lazy` ile dinamik import edildi. Vite klasör bazlı chunk'lara
// böler (`manualChunks` config'i — vite.config.ts). İlk yükleme:
//   önce → tek 2.26 MB chunk (gzip 635 KB)
//   sonra → vendor (antd/react/supabase) + per-route küçük chunk'lar
//
// Login / Dashboard sık erişilen olduğu için lazy kalır ama vendor chunk'ı
// önceden yüklendiği için aktif kullanımda fark hissedilmez.

const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })))
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const ForbiddenPage = lazy(() => import('./pages/ForbiddenPage').then((m) => ({ default: m.ForbiddenPage })))
const SifreBelirlePage = lazy(() => import('./pages/SifreBelirlePage').then((m) => ({ default: m.SifreBelirlePage })))

// Üyeler grubu
const UyeListPage = lazy(() => import('./pages/uyeler/UyeListPage').then((m) => ({ default: m.UyeListPage })))
const UyeFormPage = lazy(() => import('./pages/uyeler/UyeFormPage').then((m) => ({ default: m.UyeFormPage })))
const UyeDetailPage = lazy(() => import('./pages/uyeler/UyeDetailPage').then((m) => ({ default: m.UyeDetailPage })))

// Aidatlar
const Aidatlar = lazy(() => import('./pages/Aidatlar').then((m) => ({ default: m.Aidatlar })))
const AidatYillikPlanPage = lazy(() =>
  import('./pages/AidatYillikPlanPage').then((m) => ({ default: m.AidatYillikPlanPage })),
)

// Firmalar
const FirmaListPage = lazy(() => import('./pages/firmalar/FirmaListPage').then((m) => ({ default: m.FirmaListPage })))
const FirmaDetailPage = lazy(() =>
  import('./pages/firmalar/FirmaDetailPage').then((m) => ({ default: m.FirmaDetailPage })),
)

// Sözleşmeler
const SozlesmeFormPage = lazy(() =>
  import('./pages/sozlesmeler/SozlesmeFormPage').then((m) => ({ default: m.SozlesmeFormPage })),
)
const SozlesmeDetailPage = lazy(() =>
  import('./pages/sozlesmeler/SozlesmeDetailPage').then((m) => ({ default: m.SozlesmeDetailPage })),
)

// Hakedişler
const HakedisListPage = lazy(() =>
  import('./pages/hakedisler/HakedisListPage').then((m) => ({ default: m.HakedisListPage })),
)
const HakedisDetailPage = lazy(() =>
  import('./pages/hakedisler/HakedisDetailPage').then((m) => ({ default: m.HakedisDetailPage })),
)

// Faturalar
const FaturaListPage = lazy(() =>
  import('./pages/faturalar/FaturaListPage').then((m) => ({ default: m.FaturaListPage })),
)

// Cari hesap
const CariEkstrePage = lazy(() =>
  import('./pages/cariHesap/CariEkstrePage').then((m) => ({ default: m.CariEkstrePage })),
)
const OdemeKayit = lazy(() => import('./pages/cariHesap/OdemeKayit').then((m) => ({ default: m.OdemeKayit })))
const TahsilatListPage = lazy(() =>
  import('./pages/cariHesap/TahsilatListPage').then((m) => ({ default: m.TahsilatListPage })),
)
const CekTakibiPage = lazy(() =>
  import('./pages/cariHesap/CekTakibiPage').then((m) => ({ default: m.CekTakibiPage })),
)

// Banka hesap
const BankaHesapListPage = lazy(() =>
  import('./pages/bankaHesap/BankaHesapListPage').then((m) => ({ default: m.BankaHesapListPage })),
)
const BankaHareketleriPage = lazy(() =>
  import('./pages/bankaHesap/BankaHareketleriPage').then((m) => ({ default: m.BankaHareketleriPage })),
)

// Virman
const VirmanListPage = lazy(() => import('./pages/virman/VirmanListPage').then((m) => ({ default: m.VirmanListPage })))

// Malzeme teslim
const MalzemeTeslimListPage = lazy(() =>
  import('./pages/malzemeTeslim/MalzemeTeslimListPage').then((m) => ({ default: m.MalzemeTeslimListPage })),
)

// Projeler
const ProjeListPage = lazy(() =>
  import('./pages/projeler/ProjeListPage').then((m) => ({ default: m.ProjeListPage })),
)
const ProjeDetailPage = lazy(() =>
  import('./pages/projeler/ProjeDetailPage').then((m) => ({ default: m.ProjeDetailPage })),
)
const SerefiyePage = lazy(() => import('./pages/projeler/SerefiyePage').then((m) => ({ default: m.SerefiyePage })))
const YillikPlanPage = lazy(() =>
  import('./pages/projeler/YillikPlanPage').then((m) => ({ default: m.YillikPlanPage })),
)

// Raporlar
const AylikRaporPage = lazy(() =>
  import('./pages/raporlar/AylikRaporPage').then((m) => ({ default: m.AylikRaporPage })),
)
const YillikRaporPage = lazy(() =>
  import('./pages/raporlar/YillikRaporPage').then((m) => ({ default: m.YillikRaporPage })),
)
const UyeBorcRaporPage = lazy(() =>
  import('./pages/raporlar/UyeBorcRaporPage').then((m) => ({ default: m.UyeBorcRaporPage })),
)
const MizanPage = lazy(() => import('./pages/raporlar/MizanPage').then((m) => ({ default: m.MizanPage })))

// Ayarlar
const BirimListPage = lazy(() =>
  import('./pages/settings/BirimListPage').then((m) => ({ default: m.BirimListPage })),
)
const PozListPage = lazy(() => import('./pages/settings/PozListPage').then((m) => ({ default: m.PozListPage })))
const ParametersPage = lazy(() =>
  import('./pages/settings/ParametersPage').then((m) => ({ default: m.ParametersPage })),
)
const SifreDegistirPage = lazy(() =>
  import('./pages/settings/SifreDegistirPage').then((m) => ({ default: m.SifreDegistirPage })),
)

// Admin
const KullaniciYonetimiPage = lazy(() =>
  import('./pages/admin/KullaniciYonetimiPage').then((m) => ({ default: m.KullaniciYonetimiPage })),
)
const ProjeUyelikleriPage = lazy(() =>
  import('./pages/admin/ProjeUyelikleriPage').then((m) => ({ default: m.ProjeUyelikleriPage })),
)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

// Route-level lazy load fallback — page chunk yüklenirken ortalanmış spinner.
const PageFallback: React.FC = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
    <Spin size="large" />
  </div>
)

const App: React.FC = () => {
  return (
    <ConfigProvider
      locale={trTR}
      theme={{
        token: {
          colorPrimary: '#4f46e5',
          colorTextLightSolid: '#ffffff', // Primary buton yazıları için beyazı garantiye al
          borderRadius: 6,
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          colorBgLayout: '#f8fafc',
          fontSize: 13, // 14'ten 13'e düşürerek ~%90 ölçek hissi veriyoruz
          controlHeight: 32, // Standart yüksekliği düşürerek daha kompakt yapıyoruz
        },
        components: {
          Card: {
            boxShadowTertiary: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
            paddingLG: 16, // Kart iç boşluklarını azaltıyoruz
          },
          Button: {
            fontWeight: 500,
            controlHeight: 32,
          },
          Table: {
            headerBg: '#f8fafc',
            headerColor: '#475569',
            headerSplitColor: 'transparent',
            padding: 8, // Tablo satır boşluklarını azaltıyoruz
          },
          Menu: {
            itemBg: 'transparent',
            itemSelectedBg: 'rgba(79, 70, 229, 0.1)',
            itemSelectedColor: '#4f46e5',
            itemHeight: 32, // 36'dan 32'ye düşürerek daha fazla yer kazandırıyoruz
            subMenuItemBg: 'transparent',
          },
          Modal: {
            headerBg: '#f8fafc',
            titleFontSize: 16,
            paddingContentHorizontal: 20,
            paddingMD: 16,
          },
          Form: {
            itemMarginBottom: 12, // Form elemanları arası boşluğu azaltıyoruz
          }
        }
      }}
    >
      <AntdApp>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <LayoutProvider>
                <ProjectProvider>
                  <Router>
                    <Suspense fallback={<PageFallback />}>
                      <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route path="/forbidden" element={<ForbiddenPage />} />
                        <Route path="/sifre-belirle" element={<SifreBelirlePage />} />
                        <Route path="/" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
                          <Route index element={<Dashboard />} />
                          <Route path="uyeler" element={<UyeListPage />} />
                          <Route path="uyeler/yeni" element={<UyeFormPage />} />
                          <Route path="uyeler/:id" element={<UyeDetailPage />} />
                          <Route path="uyeler/:id/duzenle" element={<UyeFormPage />} />
                          <Route path="aidatlar" element={<Aidatlar />} />
                          <Route path="aidatlar/tanimlar" element={<Aidatlar />} />
                          <Route path="aidatlar/yillik-plan" element={<AidatYillikPlanPage />} />
                          <Route path="firmalar" element={<FirmaListPage />} />
                          <Route path="firmalar/:id" element={<FirmaDetailPage />} />
                          <Route path="cari-hesaplar" element={<CariEkstrePage />} />
                          <Route path="cari-hesaplar/odeme-kayit" element={<OdemeKayit />} />
                          <Route path="cari-hesaplar/tahsilatlar" element={<TahsilatListPage />} />
                          <Route path="tahsilatlar" element={<TahsilatListPage />} />
                          <Route path="sozlesmeler/yeni" element={<SozlesmeFormPage />} />
                          <Route path="sozlesmeler/:id" element={<SozlesmeDetailPage />} />
                          <Route path="sozlesmeler/:id/duzenle" element={<SozlesmeFormPage />} />
                          <Route path="hakedisler" element={<HakedisListPage />} />
                          <Route path="hakedisler/:id" element={<HakedisDetailPage />} />
                          <Route path="faturalar" element={<FaturaListPage />} />
                          <Route path="cek-takibi" element={<CekTakibiPage />} />
                          <Route path="banka-hesaplari" element={<BankaHesapListPage />} />
                          <Route path="banka-hesaplari/:id/hareketler" element={<BankaHareketleriPage />} />
                          <Route path="virmanlar" element={<VirmanListPage />} />
                          <Route path="fatura-irsaliye" element={<MalzemeTeslimListPage />} />
                          <Route path="projeler" element={<ProjeListPage />} />
                          <Route path="projeler/:id" element={<ProjeDetailPage />} />
                          <Route path="projeler/:id/serefiye" element={<SerefiyePage />} />
                          <Route path="projeler/:id/yillik-plan/:yil" element={<YillikPlanPage />} />
                          <Route path="raporlar/aylik" element={<AylikRaporPage />} />
                          <Route path="raporlar/yillik" element={<YillikRaporPage />} />
                          <Route path="raporlar/uye-borc" element={<UyeBorcRaporPage />} />
                          <Route path="raporlar/mizan" element={<MizanPage />} />
                          <Route path="ayarlar/birimler" element={<BirimListPage />} />
                          <Route path="ayarlar/pozlar" element={<PozListPage />} />
                          <Route path="ayarlar/parametreler" element={<ParametersPage />} />
                          <Route path="ayarlar/sifre-degistir" element={<SifreDegistirPage />} />
                          <Route
                            path="admin/kullanicilar"
                            element={
                              <ProtectedRoute requireRole="admin">
                                <KullaniciYonetimiPage />
                              </ProtectedRoute>
                            }
                          />
                          <Route
                            path="admin/projeler/:projeId/uyeler"
                            element={
                              <ProtectedRoute requireRole="admin">
                                <ProjeUyelikleriPage />
                              </ProtectedRoute>
                            }
                          />
                        </Route>
                      </Routes>
                    </Suspense>
                  </Router>
                </ProjectProvider>
              </LayoutProvider>
            </AuthProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </AntdApp>
    </ConfigProvider>
  )
}

export default App
