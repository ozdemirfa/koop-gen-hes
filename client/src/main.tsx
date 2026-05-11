import React from 'react'
import ReactDOM from 'react-dom/client'
import { App as AntdApp, ConfigProvider } from 'antd'
import trTR from 'antd/locale/tr_TR'
import dayjs from 'dayjs'
import 'dayjs/locale/tr'
import App from './App.tsx'
import './index.css'

// D1 (sprint 20260511-uye-tahsilat-firma-revisions): DatePicker "Today" → "Bugün",
// "Now" → "Şimdi", ay/gün etiketleri Türkçe. AntD locale ConfigProvider üzerinden
// global, dayjs locale ise format/relative-time için ayrıca aktif edilir.
dayjs.locale('tr')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={trTR}>
      <AntdApp>
        <App />
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>,
)
