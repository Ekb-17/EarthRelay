import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useEarthRelay } from './context.jsx'

const NAV = [
  { to: '/app', label: 'Cases', end: true },
  { to: '/app/assign', label: 'Assign' },
  { to: '/app/responses', label: 'Active Responses' },
  { to: '/app/volunteers', label: 'Volunteers' },
  { to: '/app/partners', label: 'Partners' },
  { to: '/app/reports', label: 'Reports' },
  { to: '/app/settings', label: 'Settings' },
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
}

export function OrgOnly({ children }) {
  const er = useEarthRelay()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (er.role === 'volunteer') {
      const match = location.pathname.match(/^\/case\/([^/]+)/)
      navigate(match ? `/community/task/${match[1]}` : '/community/tasks', { replace: true })
      return
    }
    er.chooseRole('ngo')
  }, [er.role, location.pathname])

  if (er.role === 'volunteer') return null
  return children
}

export default function OrgShell() {
  const er = useEarthRelay()
  const navigate = useNavigate()
  const location = useLocation()
  const title =
    TITLES[location.pathname] ||
    (location.pathname.startsWith('/case/') ? 'Case' : 'Organization')

  return (
    <div className="org-shell">
      <nav className="org-nav">
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
        <button
          type="button"
          className="ghost-btn org-nav-leave"
          onClick={() => {
            er.chooseRole('citizen')
            navigate('/')
          }}
        >
          Public site
        </button>
      </nav>
      <div className="org-body">
        <Outlet context={{ title }} />
      </div>
    </div>
  )
}
