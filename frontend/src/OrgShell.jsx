import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useEarthRelay } from './context.jsx'

const NAV = [
  { to: '/app', label: 'Cases', end: true },
  { to: '/app/assign', label: 'Assign' },
  { to: '/app/responses', label: 'Active Responses' },
  { to: '/app/volunteers', label: 'Volunteers' },
  { to: '/app/partners', label: 'Partners' },
  { to: '/app/reports', label: 'Reports' },
  { to: '/app/settings', label: 'Settings' },
  { to: '/app/helpline', label: 'Helpline' },
  { to: '/app/staff', label: 'Staff IDs' },
]

const MOBILE_PRIMARY = [
  { to: '/app', label: 'Cases', end: true },
  { to: '/app/assign', label: 'Assign' },
  { to: '/app/volunteers', label: 'Volunteers', end: true },
  { to: '/app/staff', label: 'Staff' },
]

const TITLES = {
  '/app': 'Cases',
  '/app/assign': 'Assign',
  '/app/responses': 'Active Responses',
  '/app/volunteers': 'Volunteers',
  '/app/volunteers/invite': 'Invite',
  '/app/partners': 'Partners',
  '/app/reports': 'Reports',
  '/app/settings': 'Settings',
  '/app/helpline': 'Helpline',
  '/app/staff': 'Staff IDs',
}

export function OrgOnly({ children }) {
  const er = useEarthRelay()
  const location = useLocation()

  if (er.role === 'volunteer') {
    const match = location.pathname.match(/^\/case\/([^/]+)/)
    return <Navigate to={match ? `/community/task/${match[1]}` : '/community/tasks'} replace />
  }
  if (er.role === 'staff') {
    return <Navigate to="/staff" replace />
  }
  if (!er.orgAuth) {
    return <Navigate to="/app/signin" replace />
  }
  return children
}

export default function OrgShell() {
  const er = useEarthRelay()
  const navigate = useNavigate()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const title =
    TITLES[location.pathname] ||
    (location.pathname.startsWith('/case/') ? 'Case' : 'Organization')

  function leave() {
    er.chooseRole('citizen')
    navigate('/')
  }

  function signOut() {
    er.setOrgAuth(null)
    er.chooseRole('citizen')
    navigate('/app/signin')
  }

  return (
    <div className="org-shell">
      <nav className="org-nav org-nav-desktop">
        <p className="kicker">EarthRelay</p>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `org-nav-link${isActive ? ' is-current' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
        <div className="org-nav-footer">
          <button type="button" className="ghost-btn org-nav-leave" onClick={signOut}>
            Back
          </button>
          <button type="button" className="ghost-btn org-nav-leave" onClick={leave}>
            Public site
          </button>
        </div>
      </nav>
      <nav className="org-nav-mobile" aria-label="Organization">
        {MOBILE_PRIMARY.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `org-nav-mobile-link${isActive ? ' is-current' : ''}`}
            onClick={() => setMoreOpen(false)}
          >
            {item.label}
          </NavLink>
        ))}
        <button
          type="button"
          className={`org-nav-mobile-link${moreOpen ? ' is-current' : ''}`}
          onClick={() => setMoreOpen((open) => !open)}
        >
          More
        </button>
        {moreOpen ? (
          <div className="org-more-sheet">
            <p className="kicker">More</p>
            {NAV.filter((item) => !MOBILE_PRIMARY.some((primary) => primary.to === item.to)).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `org-nav-link${isActive ? ' is-current' : ''}`}
                onClick={() => setMoreOpen(false)}
              >
                {item.label}
              </NavLink>
            ))}
            <div className="org-nav-footer">
              <button type="button" className="ghost-btn org-nav-leave" onClick={signOut}>
                Back
              </button>
              <button type="button" className="ghost-btn org-nav-leave" onClick={leave}>
                Public site
              </button>
            </div>
          </div>
        ) : null}
      </nav>
      <div className="org-body">
        {!er.orgAuth?.has_recovery_email ? (
          <p className="org-recovery-banner">
            Add a recovery email in Settings so you can reset the organization password.
          </p>
        ) : null}
        <Outlet context={{ title }} />
      </div>
      <button type="button" className="ghost-btn org-sign-out" onClick={signOut}>
        Sign out
      </button>
    </div>
  )
}
