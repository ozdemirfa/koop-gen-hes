import React, { useState } from 'react'
import { Layout, Menu, Button, theme, Space, Typography, Tooltip } from 'antd'
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
import { useProject } from '../contexts/ProjectContext'
import { useLayout } from '../contexts/LayoutContext'
import logo from '../assets/logo.png'

const { Header, Sider, Content } = Layout

export const AdminLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = theme.useToken()
  const { title, headerActions } = useLayout()
  const { activeProject } = useProject()
  const { signOut } = useAuth()

  const handleLogout = async () => {
    await signOut()
  }

  const menuItems = [
    { key: '/', icon: <BankOutlined />, label: 'Dashboard' },
    { key: '/uyeler', icon: <UserOutlined />, label: 'Üye Yönetimi' },
    {
      key: 'aidat-group',
      icon: <DollarOutlined />,
      label: 'Aidat Yönetimi',
      children: [
        { key: '/aidatlar', label: 'Aidat Listesi' },
        { key: '/aidatlar/tanimlar', label: 'Aidat Tanımları' },
      ],
    },
    {
      key: 'gelir-gider-group',
      icon: <TransactionOutlined />,
      label: 'Cari Hareketler',
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
    { key: '/projeler', icon: <ProjectOutlined />, label: 'İnşaat Projeleri' },
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
          overflowY: 'auto'
        }}
      >
        <div style={{ padding: '24px 8px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <img 
              src={logo} 
              alt="KoopGenHes Logo" 
              style={{ 
                height: collapsed ? '32px' : '64px',
                width: '100%',
                maxWidth: collapsed ? '40px' : '180px',
                objectFit: 'contain',
                transition: 'all 0.2s ease-in-out'
              }} 
            />
          </div>
          {activeProject && (
            <Tooltip title={collapsed ? `Aktif Proje: ${activeProject.proje_adi}` : ''} placement="right">
              <div style={{ padding: collapsed ? '0' : '0 12px', textAlign: 'center' }}>
                {!collapsed ? (
                  <>
                    <Typography.Text type="secondary" style={{ fontSize: '10px', display: 'block' }}>
                      AKTİF PROJE
                    </Typography.Text>
                    <Typography.Text strong style={{ 
                      fontSize: '12px', 
                      color: '#4f46e5', 
                      display: 'block', 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis', 
                      whiteSpace: 'nowrap' 
                    }}>
                      {activeProject.proje_adi}
                    </Typography.Text>
                  </>
                ) : (
                  <ProjectOutlined style={{ color: '#4f46e5', fontSize: '16px', marginTop: '4px' }} />
                )}
              </div>
            </Tooltip>
          )}
        </div>
        <Menu
          theme="light"
          selectedKeys={[location.pathname]}
          mode="inline"
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0, marginTop: 8, paddingBottom: 48 }}
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
          <div id="header-left" style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: 0 }}>
            {title && (
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                <Typography.Text style={{ margin: 0, color: '#1e293b', whiteSpace: 'nowrap', fontWeight: 600, fontSize: '16px' }}>
                  {title}
                </Typography.Text>
              </div>
            )}
            
            {headerActions && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                marginLeft: '8px',
                flex: 1,
                minWidth: 0,
                overflow: 'hidden'
              }}>
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
