import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { EarthRelayProvider } from './context.jsx'
import { CaseDetails, ContactPage, Landing, RolePick, SeverityAlert } from './pages.jsx'
import Workspace from './Workspace.jsx'
import './App.css'

export default function App() {
  return (
    <EarthRelayProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/role" element={<RolePick />} />
          <Route path="/app" element={<Workspace />} />
          <Route path="/case/:caseId" element={<CaseDetails />} />
          <Route path="/case/:caseId/alert" element={<SeverityAlert />} />
          <Route path="/case/:caseId/contact" element={<ContactPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </EarthRelayProvider>
  )
}
