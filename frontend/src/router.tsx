import { createBrowserRouter } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { Dashboard } from './pages/Dashboard'
import { EPGView } from './pages/EPGView'
import { Channels } from './pages/Channels'
import { ProgrammeDetail } from './pages/ProgrammeDetail'
import { Sources } from './pages/Sources'
import { Outputs } from './pages/Outputs'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'epg', element: <EPGView /> },
      { path: 'channels', element: <Channels /> },
      { path: 'programmes/:id', element: <ProgrammeDetail /> },
      { path: 'sources', element: <Sources /> },
      { path: 'outputs', element: <Outputs /> },
    ],
  },
])
