import React, { Suspense, lazy } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider, App as AntdApp, Spin } from 'antd'
import trTR from 'antd/locale/tr_TR'

import { AuthProvider } from './contexts/AuthContext'
import { ProjectProvider } from './contexts/ProjectContext'
import { LayoutProvider } from './contexts/LayoutContext'
import { AdminLayout } from './components/AdminLayout'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { ProtectedRoute } from './components/common/ProtectedRoute'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { ForbiddenPage } from './pages/ForbiddenPage'

// Sprint qa-review-bugfix-faz3+1 (2026-05-25, ileri-sprint adayi):
// Route-based code splitting — Login + AdminLayout + Dashboard + auth/public
// sayfalar initial bundle'da kalir; diger 30+ sayfa React.lazy ile sadece
// route'a gidildiginde yuklenir. AntD chunk korunur (468KB gzip) ama main
// app bundle dramatik kuculur cunku sayfalarin kendi AntD-touch'larina
// initial'da ihtiyac yok.
//
// Named export'lu sayfalar lazy'ye `then(m => ({ default: m.X }))` wrapper
// ile bagli. Bu wrapper Rollup tree-shake'ini ve manualChunks'i bozmaz.

// Auth public sayfalari — kucuk, public route'larda hemen render olmali
const DavetKabulPage = lazy(() =>
  import('./pages/auth/DavetKabulPage').then((m) => ({ default: m.DavetKabulPage })),
)
const ForgotPasswordPage = lazy(() =>
  import('./pages/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
)
const ResetPasswordPage = lazy(() =>
  import('./pages/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
)

// Üye modülü
const UyeListPage = lazy(() =>
  import('./pages/uyeler/UyeListPage').then((m) => ({ default: m.UyeListPage })),
)
const UyeFormPage = lazy(() =>
  import('./pages/uyeler/UyeFormPage').then((m) => ({ default: m.UyeFormPage })),
)
const UyeDetailPage = lazy(() =>
  import('./pages/uyeler/UyeDetailPage').then((m) => ({ default: m.UyeDetailPage })),
)

// Aidat modülü
const Aidatlar = lazy(() => import('./pages/Aidatlar').then((m) => ({ default: m.Aidatlar })))
const AidatYillikPlanPage = lazy(() =>
  import('./pages/AidatYillikPlanPage').then((m) => ({ default: m.AidatYillikPlanPage })),
)

// Firma + Sözleşme
const FirmaListPage = lazy(() =>
  import('./pages/firmalar/FirmaListPage').then((m) => ({ default: m.FirmaListPage })),
)
const FirmaDetailPage = lazy(() =>
  import('./pages/firmalar/FirmaDetailPage').then((m) => ({ default: m.FirmaDetailPage })),
)
const SozlesmeFormPage = lazy(() =>
  import('./pages/sozlesmeler/SozlesmeFormPage').then((m) => ({ default: m.SozlesmeFormPage })),
)

// Kurumsal cari
const KurumListPage = lazy(() =>
  import('./pages/kurumlar/KurumListPage').then((m) => ({ default: m.KurumListPage })),
)
const SozlesmeDetailPage = lazy(() =>
  import('./pages/sozlesmeler/SozlesmeDetailPage').then((m) => ({ default: m.SozlesmeDetailPage })),
)

// Hakediş + Fatura
const HakedisListPage = lazy(() =>
  import('./pages/hakedisler/HakedisListPage').then((m) => ({ default: m.HakedisListPage })),
)
const HakedisDetailPage = lazy(() =>
  import('./pages/hakedisler/HakedisDetailPage').then((m) => ({ default: m.HakedisDetailPage })),
)
const FaturaListPage = lazy(() =>
  import('./pages/faturalar/FaturaListPage').then((m) => ({ default: m.FaturaListPage })),
)

// Cari + Ödeme
const CariEkstrePage = lazy(() =>
  import('./pages/cariHesap/CariEkstrePage').then((m) => ({ default: m.CariEkstrePage })),
)
const OdemeKayit = lazy(() =>
  import('./pages/cariHesap/OdemeKayit').then((m) => ({ default: m.OdemeKayit })),
)
const TahsilatListPage = lazy(() =>
  import('./pages/cariHesap/TahsilatListPage').then((m) => ({ default: m.TahsilatListPage })),
)
const CekTakibiPage = lazy(() =>
  import('./pages/cariHesap/CekTakibiPage').then((m) => ({ default: m.CekTakibiPage })),
)

// Banka + Virman
const BankaHesapListPage = lazy(() =>
  import('./pages/bankaHesap/BankaHesapListPage').then((m) => ({ default: m.BankaHesapListPage })),
)
const BankaHareketleriPage = lazy(() =>
  import('./pages/bankaHesap/BankaHareketleriPage').then((m) => ({
    default: m.BankaHareketleriPage,
  })),
)
const VirmanListPage = lazy(() =>
  import('./pages/virman/VirmanListPage').then((m) => ({ default: m.VirmanListPage })),
)
const MalzemeTeslimListPage = lazy(() =>
  import('./pages/malzemeTeslim/MalzemeTeslimListPage').then((m) => ({
    default: m.MalzemeTeslimListPage,
  })),
)

// Proje modülü
const ProjeListPage = lazy(() =>
  import('./pages/projeler/ProjeListPage').then((m) => ({ default: m.ProjeListPage })),
)
const ArsivlenmisProjelerPage = lazy(() =>
  import('./pages/projeler/ArsivlenmisProjelerPage').then((m) => ({
    default: m.ArsivlenmisProjelerPage,
  })),
)
const ProjeDetailPage = lazy(() =>
  import('./pages/projeler/ProjeDetailPage').then((m) => ({ default: m.ProjeDetailPage })),
)
const SerefiyePage = lazy(() =>
  import('./pages/projeler/SerefiyePage').then((m) => ({ default: m.SerefiyePage })),
)
const YillikPlanPage = lazy(() =>
  import('./pages/projeler/YillikPlanPage').then((m) => ({ default: m.YillikPlanPage })),
)
const YonetimEkibiPage = lazy(() =>
  import('./pages/yonetim/YonetimEkibiPage').then((m) => ({ default: m.YonetimEkibiPage })),
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
const MizanPage = lazy(() =>
  import('./pages/raporlar/MizanPage').then((m) => ({ default: m.MizanPage })),
)

// Settings
const BirimListPage = lazy(() =>
  import('./pages/settings/BirimListPage').then((m) => ({ default: m.BirimListPage })),
)
const PozListPage = lazy(() =>
  import('./pages/settings/PozListPage').then((m) => ({ default: m.PozListPage })),
)
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

// Sprint qa-review-bugfix-faz3 (2026-05-25, Batch 4):
// staleTime 30s → 60s (cache hit %30 → %60), gcTime 5dk (bellek temizliği).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
    },
  },
})

// Suspense fallback — lazy chunk yuklenirken gosterilir.
// AdminLayout icindeki sayfalar icin Outlet-level fallback; AdminLayout
// sticky header zaten render olduktan sonra icerige Spin koyariz.
const RouteSpinner: React.FC = () => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '40vh',
      width: '100%',
    }}
  >
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
          colorTextLightSolid: '#ffffff',
          borderRadius: 6,
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          colorBgLayout: '#f8fafc',
          fontSize: 13,
          controlHeight: 32,
        },
        components: {
          Card: {
            boxShadowTertiary: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
            paddingLG: 16,
          },
          Button: {
            fontWeight: 500,
            controlHeight: 32,
          },
          Table: {
            headerBg: '#f8fafc',
            headerColor: '#475569',
            headerSplitColor: 'transparent',
            padding: 8,
          },
          Menu: {
            itemBg: 'transparent',
            itemSelectedBg: 'rgba(79, 70, 229, 0.1)',
            itemSelectedColor: '#4f46e5',
            itemHeight: 32,
            subMenuItemBg: 'transparent',
          },
          Modal: {
            headerBg: '#f8fafc',
            titleFontSize: 16,
            paddingContentHorizontal: 20,
            paddingMD: 16,
          },
          Form: {
            itemMarginBottom: 12,
          },
        },
      }}
    >
      <AntdApp>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <LayoutProvider>
                <ProjectProvider>
                  <Router>
                    <Suspense fallback={<RouteSpinner />}>
                      <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route path="/forbidden" element={<ForbiddenPage />} />
                        <Route path="/davet-kabul/:token" element={<DavetKabulPage />} />
                        {/*
                          Sprint role-system-modernization (PR-E, 2026-05-20):
                          E-mail tabanlı self şifre reset akışı. Her iki sayfa
                          da public — login öncesi erişilebilir, ProtectedRoute
                          dışında tutulur.
                        */}
                        <Route path="/auth/sifremi-unuttum" element={<ForgotPasswordPage />} />
                        <Route path="/auth/sifre-sifirla" element={<ResetPasswordPage />} />
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
                          <Route path="kurumlar" element={<KurumListPage />} />
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
                          <Route path="projeler/arsiv" element={<ArsivlenmisProjelerPage />} />
                          <Route path="projeler/:id" element={<ProjeDetailPage />} />
                          <Route path="projeler/:id/serefiye" element={<SerefiyePage />} />
                          <Route path="projeler/:id/yillik-plan/:yil" element={<YillikPlanPage />} />
                          <Route path="projeler/:id/yonetim-ekibi" element={<YonetimEkibiPage />} />
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
                              <ProtectedRoute requireRole="manager">
                                <KullaniciYonetimiPage />
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
