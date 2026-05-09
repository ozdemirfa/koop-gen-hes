import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider, App as AntdApp, Spin } from 'antd'
import trTR from 'antd/locale/tr_TR'

import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ProjectProvider } from './contexts/ProjectContext'
import { LayoutProvider } from './contexts/LayoutContext'
import { AdminLayout } from './components/AdminLayout'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { UyeListPage } from './pages/uyeler/UyeListPage'
import { UyeFormPage } from './pages/uyeler/UyeFormPage'
import { UyeDetailPage } from './pages/uyeler/UyeDetailPage'
import { Aidatlar } from './pages/Aidatlar'
import { AidatYillikPlanPage } from './pages/AidatYillikPlanPage'
import { FirmaListPage } from './pages/firmalar/FirmaListPage'
import { FirmaDetailPage } from './pages/firmalar/FirmaDetailPage'
import { SozlesmeFormPage } from './pages/sozlesmeler/SozlesmeFormPage'
import { SozlesmeDetailPage } from './pages/sozlesmeler/SozlesmeDetailPage'
import { HakedisListPage } from './pages/hakedisler/HakedisListPage'
import { HakedisDetailPage } from './pages/hakedisler/HakedisDetailPage'
import { FaturaListPage } from './pages/faturalar/FaturaListPage'
import { CariEkstrePage } from './pages/cariHesap/CariEkstrePage'
import { OdemeKayit } from './pages/cariHesap/OdemeKayit'
import { BankaHesapListPage } from './pages/bankaHesap/BankaHesapListPage'
import { BankaHareketleriPage } from './pages/bankaHesap/BankaHareketleriPage'
import { MalzemeTeslimListPage } from './pages/malzemeTeslim/MalzemeTeslimListPage'
import { ProjeListPage } from './pages/projeler/ProjeListPage'
import { ProjeDetailPage } from './pages/projeler/ProjeDetailPage'
import { SerefiyePage } from './pages/projeler/SerefiyePage'
import { YillikPlanPage } from './pages/projeler/YillikPlanPage'
import { CekTakibiPage } from './pages/cariHesap/CekTakibiPage'
import { AylikRaporPage } from './pages/raporlar/AylikRaporPage'
import { YillikRaporPage } from './pages/raporlar/YillikRaporPage'
import { UyeBorcRaporPage } from './pages/raporlar/UyeBorcRaporPage'
import { MizanPage } from './pages/raporlar/MizanPage'
import { BirimListPage } from './pages/settings/BirimListPage'
import { PozListPage } from './pages/settings/PozListPage'
import { ParametersPage } from './pages/settings/ParametersPage'
import { ErrorBoundary } from './components/common/ErrorBoundary'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth()
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

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
                    <Routes>
                      <Route path="/login" element={<Login />} />
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
                        <Route path="sozlesmeler/yeni" element={<SozlesmeFormPage />} />
                        <Route path="sozlesmeler/:id" element={<SozlesmeDetailPage />} />
                        <Route path="sozlesmeler/:id/duzenle" element={<SozlesmeFormPage />} />
                        <Route path="hakedisler" element={<HakedisListPage />} />
                        <Route path="hakedisler/:id" element={<HakedisDetailPage />} />
                        <Route path="faturalar" element={<FaturaListPage />} />
                        <Route path="cek-takibi" element={<CekTakibiPage />} />
                        <Route path="banka-hesaplari" element={<BankaHesapListPage />} />
                        <Route path="banka-hesaplari/:id/hareketler" element={<BankaHareketleriPage />} />
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
                      </Route>
                    </Routes>
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
