import { createBrowserRouter } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { AuthGate } from './components/auth/AuthGate'
import { RequirePermission } from './components/auth/RequirePermission'
import { Dashboard } from './pages/Dashboard'
import { EPGView } from './pages/EPGView'
import { Channels } from './pages/Channels'
import { ProgrammeDetail } from './pages/ProgrammeDetail'
import { Sources } from './pages/Sources'
import { Outputs } from './pages/Outputs'
import { MulticastOutputs } from './pages/MulticastOutputs'
import { Users } from './pages/system/Users'
import { Roles } from './pages/system/Roles'
import { RadiusServers } from './pages/system/RadiusServers'
import { Account } from './pages/Account'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AuthGate><Layout /></AuthGate>,
    children: [
      { index: true, element: <RequirePermission sections={['dashboard']} redirect><Dashboard /></RequirePermission> },
      { path: 'epg', element: <RequirePermission sections={['epg']}><EPGView /></RequirePermission> },
      { path: 'channels', element: <RequirePermission sections={['channels']}><Channels /></RequirePermission> },
      { path: 'programmes/:id', element: <RequirePermission sections={['epg', 'channels']}><ProgrammeDetail /></RequirePermission> },
      { path: 'sources', element: <RequirePermission sections={['sources']}><Sources /></RequirePermission> },
      { path: 'outputs', element: <RequirePermission sections={['outputs']}><Outputs /></RequirePermission> },
      { path: 'multicast', element: <RequirePermission sections={['multicast']}><MulticastOutputs /></RequirePermission> },
      { path: 'system/users', element: <RequirePermission sections={['users']}><Users /></RequirePermission> },
      { path: 'system/roles', element: <RequirePermission sections={['roles']}><Roles /></RequirePermission> },
      { path: 'system/radius', element: <RequirePermission sections={['radius']}><RadiusServers /></RequirePermission> },
      { path: 'account', element: <Account /> },
    ],
  },
])
