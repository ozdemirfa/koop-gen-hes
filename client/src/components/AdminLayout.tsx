import React, { useState } from 'react'
import { Layout, Menu, Button, theme, Space, Typography } from 'antd'
import {
  UserOutlined,
  LogoutOutlined,
  DollarOutlined,
  BankOutlined,
  TransactionOutlined,
  ShopOutlined,
  TruckOutlined,
  ProjectOutlined,
  PieChartOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ProjectSelector } from './common/ProjectSelector'
import { useLayout } from '../contexts/LayoutContext'

const { Header, Sider, Content } = Layout

export const AdminLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = theme.useToken()
  const { title, headerActions } = useLayout()

  const { signOut } = useAuth()

  const handleLogout = async () => {
    await signOut()
  }

  const menuItems = [
    { key: '/', icon: <BankOutlined />, label: 'Dashboard' },
    { key: '/uyeler', icon: <UserOutlined />, label: 'Üye Yönetimi' },
    { key: '/aidatlar', icon: <DollarOutlined />, label: 'Aidat Yönetimi' },
    {
      key: 'gelir-gider-group',
      icon: <TransactionOutlined />,
      label: 'Gelir / Gider',
      children: [
        { key: '/gelir-gider', label: 'İşlemler' },
        { key: '/gelir-gider/kategoriler', label: 'Kategoriler' },
      ],
    },
    {
      key: 'firmalar-group',
      icon: <ShopOutlined />,
      label: 'Firmalar',
      children: [
        { key: '/firmalar', label: 'Firma Listesi' },
        { key: '/hakedisler', label: 'Hakedişler' },
        { key: '/faturalar', label: 'Faturalar' },
        { key: '/cari-hesaplar', label: 'Cari Ekstre' },
        { key: '/cek-takibi', label: 'Çek Takibi' },
      ],
    },
    {
      key: 'cari-banka-group',
      icon: <WalletOutlined />,
      label: 'Bankalar',
      children: [
        { key: '/banka-hesaplari', label: 'Banka Hesapları' },
        { key: '/banka-uzlastirma', label: 'Banka Uzlaştırma' },
      ],
    },
    { key: '/fatura-irsaliye', icon: <TruckOutlined />, label: 'Malzeme Teslimat' },
    { key: '/projeler', icon: <ProjectOutlined />, label: 'Proje Yönetimi' },
    {
      key: 'raporlar-group',
      icon: <PieChartOutlined />,
      label: 'Raporlar',
      children: [
        { key: '/raporlar/aylik', label: 'Aylık Mali Rapor' },
        { key: '/raporlar/yillik', label: 'Yıllık Mali Rapor' },
        { key: '/raporlar/uye-borc', label: 'Üye Borç Listesi' },
      ],
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={(value) => setCollapsed(value)}
        breakpoint="lg"
        collapsedWidth={window.innerWidth < 768 ? 0 : 80}
        theme="light"
        style={{
          borderRight: '1px solid #e2e8f0',
          position: 'sticky',
          top: 0,
          left: 0,
          height: '100vh',
          zIndex: 1000,
        }}
      >
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ 
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', 
            borderRadius: 8, 
            padding: '4px 12px',
            color: 'white',
            fontWeight: 700,
            fontSize: collapsed ? '14px' : '18px',
            transition: 'all 0.2s'
          }}>
            {collapsed ? 'KG' : 'KoopGen'}
          </div>
        </div>
        <Menu
          theme="light"
          selectedKeys={[location.pathname]}
          mode="inline"
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0, marginTop: 8 }}
        />
      </Sider>
      <Layout>
        <Header style={{ 
          padding: '0 24px', 
          background: 'white', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          borderBottom: '1px solid #e2e8f0',
          position: 'sticky',
          top: 0,
          zIndex: 999,
          height: 64
        }}>
          <div id="header-left" style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <ProjectSelector />
            {title && (
              <Typography.Title level={5} style={{ margin: 0, color: '#1e293b' }}>
                {title}
              </Typography.Title>
            )}
            {headerActions && (
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {headerActions}
              </div>
            )}
          </div>
          <div id="header-right" style={{ display: 'flex', alignItems: 'center' }}>
            <Button 
              type="text" 
              icon={<LogoutOutlined />} 
              onClick={handleLogout}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                color: '#64748b',
                height: 40,
                borderRadius: 8
              }}
            >
              Çıkış Yap
            </Button>
          </div>
        </Header>
        <Content style={{ 
          margin: '24px', 
          minHeight: 280, 
          background: 'transparent',
          overflow: 'initial'
        }}>
          <div style={{ maxWidth: 1400, margin: '0 auto' }}>
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}
