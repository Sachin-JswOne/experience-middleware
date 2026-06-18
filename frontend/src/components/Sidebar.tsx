import { useNavigate, useLocation } from 'react-router-dom';

export default function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const onDashboard = pathname === '/' || pathname.startsWith('/routes');

  return (
    <aside className="sidebar">
      <a className="sidebar__brand" onClick={() => navigate('/')}>
        <span className="sidebar__brand-mark" />
        BEFE Admin
      </a>
      <nav className="sidebar__nav">
        <a
          className={`nav-item${onDashboard ? ' nav-item--active' : ''}`}
          onClick={() => navigate('/')}
        >
          <span className="nav-item__icon">▤</span>
          Route Config
        </a>
      </nav>
    </aside>
  );
}
