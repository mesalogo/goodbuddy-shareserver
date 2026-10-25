import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { pages } from './app-config'
import { AppShell } from './components/app-shell'
import { SharingCenter } from './components/sharing-center'
import { OverviewPage } from './components/overview-page'
import { GatewayPage } from './components/gateway-page'
import { ConsolePage } from './components/console-page'
import { consoleModules, type ConsoleModule } from '../../shared/console'
import { DevicesPage } from './components/devices-page'
import { UnavailablePage } from './components/unavailable-page'
import { DocumentsPage } from './components/documents-page'

export default function App() {
  return <BrowserRouter><ApplicationRoutes /></BrowserRouter>
}

function ApplicationRoutes() {
  const location = useLocation()
  if (location.pathname === '/office/editor') return <DocumentsPage embedded />
  return (
      <AppShell>
        <Routes>
          {pages.map((page) => (
            <Route
              key={page.path}
              path={page.path}
              element={
                page.path === '/' ? <OverviewPage />
                  : page.path === '/capabilities' ? <SharingCenter />
                    : page.path === '/model-gateway' ? <GatewayPage />
                    : page.path === '/documents' ? <DocumentsPage />
                    : Object.hasOwn(consoleModules, page.path.slice(1)) ? <ConsolePage key={page.path} module={page.path.slice(1) as ConsoleModule} />
                    : page.path === '/audit' ? <ConsolePage module="audit" />
                      : page.path === '/devices' ? <DevicesPage />
                        : <UnavailablePage title={page.title} description={page.description} boundary={page.boundary ?? '该模块的身份、权限和持久化接口尚未接入，因此当前不显示示例数据，也不提供不会生效的操作。'} next={page.next} tabs={page.tabs?.map(({ label, dataKey }) => ({ label, key: dataKey }))} />
              }
            />
          ))}
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </AppShell>
  )
}
