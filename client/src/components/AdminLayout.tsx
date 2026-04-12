import React, { useState } from 'react'
import { Layout, Menu, Button, theme } from 'antd'
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
} from '@ant-design/icons'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const { Header, Sider, Content } = Layout

export const AdminLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = theme.useToken()

  const { signOut } = useAuth()

  const handleLogout = async () => {
    await signOut()
  }

  const menuItems = [
    { key: '/', icon: <BankOutlined />, label: 'Dashboard' },
    { key: '/uyeler', icon: <UserOutlined />, label: 'Üyeler' },
    { key: '/aidatlar', icon: <DollarOutlined />, label: 'Aidat Yönetimi' },
    { key: '/gelir-gider', icon: <TransactionOutlined />, label: 'Gelir / Gider' },
    {
      key: 'firmalar-group',
      icon: <ShopOutlined />,
      label: 'Firmalar & Sözleşmeler',
      children: [
        { key: '/firmalar', label: 'Firma Listesi' },
        { key: '/hakedisler', label: 'Hakedişler' },
        { key: '/faturalar', label: 'Faturalar' },
      ],
    },
    {
      key: 'cari-banka-group',
      icon: <BankOutlined />,
      label: 'Cari Hesap & Banka',
      children: [
        { key: '/cari-hesaplar', label: 'Cari Ekstre' },
        { key: '/banka-hesaplari', label: 'Banka Hesapları' },
        { key: '/banka-uzlastirma', label: 'Banka Uzlaştırma' },
      ],
    },
    { key: '/malzeme-teslimat', icon: <TruckOutlined />, label: 'Malzeme Teslimat' },
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
        theme="dark"
      >
        <div style={{ height: 32, margin: 16, background: 'rgba(255, 255, 255, 0.2)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'white', fontWeight: 'bold' }}>{collapsed ? 'KG' : 'KoopGenHes'}</span>
        </div>
        <Menu
          theme="dark"
          selectedKeys={[location.pathname]}
          mode="inline"
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: '0 24px', background: token.colorBgContainer, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,21,41,.08)' }}>
          <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout}>
            Çıkış Yap
          </Button>
        </Header>
        <Content style={{ margin: '16px 8px', padding: 16, minHeight: 280, background: token.colorBgContainer, borderRadius: 8, overflowX: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
