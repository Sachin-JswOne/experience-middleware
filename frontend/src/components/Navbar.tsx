import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Navbar() {
  const { logout } = useAuth();
  const { pathname } = useLocation();
  const page =
    pathname === '/routes/new'
      ? 'Create Route'
      : pathname.startsWith('/routes')
        ? 'Edit Route'
        : 'Route Config';

  return (
    <header className="navbar">
      <div className="navbar__crumbs">
        <span className="navbar__crumb-trail">
          Pages / <b>{page}</b>
        </span>
        <span className="navbar__page">{page}</span>
      </div>
      <div className="navbar__actions">
        <button className="btn btn--secondary" onClick={logout}>
          Sign out
        </button>
      </div>
    </header>
  );
}
