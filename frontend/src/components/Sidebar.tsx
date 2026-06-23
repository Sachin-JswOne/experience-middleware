import { useNavigate, useLocation } from 'react-router-dom';

const HISTORY_ITEMS = [
  { type: 'ai-invoke', label: 'Registration' },
  { type: 'business-classification', label: 'Business' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const onDashboard = pathname === '/' || pathname.startsWith('/routes');
  const onPromptMgmt = pathname === '/segmentation/prompts';

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
        <div className="sidebar__group-label">Segmentation</div>
        <a
          className={`nav-item${onPromptMgmt ? ' nav-item--active' : ''}`}
          onClick={() => navigate('/segmentation/prompts')}
        >
          <span className="nav-item__icon">✦</span>
          Prompt Management
        </a>
        <div className="sidebar__sub-label">History</div>
        {HISTORY_ITEMS.map((it) => {
          const active = pathname === `/segmentation/prompts/history/${it.type}`;
          return (
            <a
              key={it.type}
              className={`nav-item nav-item--sub${active ? ' nav-item--active' : ''}`}
              onClick={() => navigate(`/segmentation/prompts/history/${it.type}`)}
            >
              <span className="nav-item__icon">›</span>
              {it.label}
            </a>
          );
        })}
      </nav>
    </aside>
  );
}
