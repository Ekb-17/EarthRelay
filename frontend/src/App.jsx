import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { EarthRelayProvider } from './context.jsx'
import { AboutPage, CaseDetails, ContactPage, HelpPage, Landing, SeverityAlert } from './pages.jsx'
import {
  ActivityLog,
  ConfirmPage,
  DispatchBrief,
  NearbyCases,
  SafetyPage,
} from './FlowPages.jsx'
import WhoYouAre from './WhoYouAre.jsx'
import Workspace from './Workspace.jsx'
import OrgShell, { OrgOnly } from './OrgShell.jsx'
import OrgSignIn from './OrgAuth.jsx'
import AssignResponse, { AssignBoard } from './AssignResponse.jsx'
import {
  ActiveResponses,
  HelplinePage,
  InvitePage,
  OrgReportsPage,
  PartnersPage,
  SettingsPage,
  StaffPage,
  VolunteersPage,
} from './OrgPages.jsx'
import {
  CommunityJoin,
  CommunityLanding,
  CommunitySignIn,
  FieldTask,
  VolunteerTasks,
  VolunteerShell,
} from './Community.jsx'
import { StaffHome, StaffSignInPage } from './Staff.jsx'
import './App.css'

export default function App() {
  return (
    <EarthRelayProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route element={<VolunteerShell />}>
            <Route path="/community" element={<CommunityLanding />} />
            <Route path="/community/join" element={<CommunityJoin />} />
            <Route path="/community/signin" element={<CommunitySignIn />} />
            <Route path="/community/tasks" element={<VolunteerTasks />} />
            <Route path="/community/task/:caseId" element={<FieldTask />} />
          </Route>
          <Route path="/staff/signin" element={<StaffSignInPage />} />
          <Route path="/staff" element={<StaffHome />} />
          <Route path="/app/signin" element={<OrgSignIn />} />
          <Route path="/who" element={<WhoYouAre />} />
          <Route path="/safety" element={<SafetyPage />} />
          <Route path="/confirm" element={<ConfirmPage />} />
          <Route path="/reports" element={<Navigate to="/" replace />} />
          <Route path="/role" element={<Navigate to="/" replace />} />
          <Route
            element={
              <OrgOnly>
                <OrgShell />
              </OrgOnly>
            }
          >
            <Route path="/app" element={<Workspace />} />
            <Route path="/app/assign" element={<AssignBoard />} />
            <Route path="/app/responses" element={<ActiveResponses />} />
            <Route path="/app/volunteers" element={<VolunteersPage />} />
            <Route path="/app/volunteers/invite" element={<InvitePage />} />
            <Route path="/app/partners" element={<PartnersPage />} />
            <Route path="/app/reports" element={<OrgReportsPage />} />
            <Route path="/app/settings" element={<SettingsPage />} />
            <Route path="/app/helpline" element={<HelplinePage />} />
            <Route path="/app/staff" element={<StaffPage />} />
            <Route path="/case/:caseId" element={<CaseDetails />} />
            <Route path="/case/:caseId/assign" element={<AssignResponse />} />
            <Route path="/case/:caseId/brief" element={<DispatchBrief />} />
            <Route path="/case/:caseId/log" element={<ActivityLog />} />
            <Route path="/case/:caseId/nearby" element={<NearbyCases />} />
            <Route path="/case/:caseId/contact" element={<ContactPage />} />
          </Route>
          <Route path="/case/:caseId/alert" element={<SeverityAlert />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </EarthRelayProvider>
  )
}
