import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider } from 'antd'
import trTR from 'antd/locale/tr_TR'

import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AdminLayout } from './components/AdminLayout'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { UyeListPage } from './pages/uyeler/UyeListPage'
import { UyeFormPage } from './pages/uyeler/UyeFormPage'
import { UyeDetailPage } from './pages/uyeler/UyeDetailPage'
import { Aidatlar } from './pages/Aidatlar'
import { GelirGider } from './pages/GelirGider'
import { FirmaListPage } from './pages/firmalar/FirmaListPage'
import { FirmaDetailPage } from './pages/firmalar/FirmaDetailPage'
import { SozlesmeFormPage } from './pages/sozlesmeler/SozlesmeFormPage'
import { SozlesmeDetailPage } from './pages/sozlesmeler/SozlesmeDetailPage'
import { HakedisListPage } from './pages/hakedisler/HakedisListPage'
import { HakedisDetailPage } from './pages/hakedisler/HakedisDetailPage'
import { FaturaListPage } from './pages/faturalar/FaturaListPage'
import { OdemePlaniPage } from './pages/faturalar/OdemePlaniPage'
import { CariEkstrePage } from './pages/cariHesap/CariEkstrePage'
import { BankaHesapListPage } from './pages/bankaHesap/BankaHesapListPage'
import { BankaUzlastirmaPage } from './pages/bankaHesap/BankaUzlastirmaPage'
import { MalzemeTeslimListPage } from './pages/malzemeTeslim/MalzemeTeslimListPage'
import { ProjeListPage } from './pages/projeler/ProjeListPage'
import { ProjeDetailPage } from './pages/projeler/ProjeDetailPage'
import { SerefiyePage } from './pages/projeler/SerefiyePage'
import { YillikPlanPage } from './pages/projeler/YillikPlanPage'
import { CekTakibiPage } from './pages/cariHesap/CekTakibiPage'
import { AylikRaporPage } from './pages/raporlar/AylikRaporPage'
import { YillikRaporPage } from './pages/raporlar/YillikRaporPage'
import { UyeBorcRaporPage } from './pages/raporlar/UyeBorcRaporPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth()
  if (loading) return null
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

const App: React.FC = () => {
  return (
    <ConfigProvider locale={trTR}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
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
                <Route path="gelir-gider" element={<GelirGider />} />
                <Route path="firmalar" element={<FirmaListPage />} />
                <Route path="firmalar/:id" element={<FirmaDetailPage />} />
                <Route path="sozlesmeler/yeni" element={<SozlesmeFormPage />} />
                <Route path="sozlesmeler/:id" element={<SozlesmeDetailPage />} />
                <Route path="sozlesmeler/:id/duzenle" element={<SozlesmeFormPage />} />
                <Route path="hakedisler" element={<HakedisListPage />} />
                <Route path="hakedisler/:id" element={<HakedisDetailPage />} />
                <Route path="faturalar" element={<FaturaListPage />} />
                <Route path="faturalar/:id/odeme-plani" element={<OdemePlaniPage />} />
                <Route path="cari-hesaplar" element={<CariEkstrePage />} />
                <Route path="cek-takibi" element={<CekTakibiPage />} />
                <Route path="banka-hesaplari" element={<BankaHesapListPage />} />
                <Route path="banka-uzlastirma" element={<BankaUzlastirmaPage />} />
                <Route path="fatura-irsaliye" element={<MalzemeTeslimListPage />} />
                <Route path="projeler" element={<ProjeListPage />} />
                <Route path="projeler/:id" element={<ProjeDetailPage />} />
                <Route path="projeler/:id/serefiye" element={<SerefiyePage />} />
                <Route path="projeler/:id/yillik-plan/:yil" element={<YillikPlanPage />} />
                <Route path="raporlar/aylik" element={<AylikRaporPage />} />
                <Route path="raporlar/yillik" element={<YillikRaporPage />} />
                <Route path="raporlar/uye-borc" element={<UyeBorcRaporPage />} />
              </Route>
            </Routes>
          </Router>
        </AuthProvider>
      </QueryClientProvider>
    </ConfigProvider>
  )
}

export default App
