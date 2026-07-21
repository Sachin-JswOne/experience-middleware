import { Routes, Route } from 'react-router-dom';
import ProtectedLayout from '@/components/features/layout/ProtectedLayout';
import LoginPage from '@/pages/LoginPage';
import OAuth2Redirect from '@/pages/OAuth2Redirect';
import DashboardPage from '@/pages/DashboardPage';
import PromptsPage from '@/pages/PromptsPage';
import MetricsPage from '@/pages/MetricsPage';
import NotFoundPage from '@/pages/NotFoundPage';

const App = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/oauth2" element={<OAuth2Redirect />} />
    <Route element={<ProtectedLayout />}>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/metrics" element={<MetricsPage />} />
      <Route path="/prompts" element={<PromptsPage />} />
      <Route path="/prompts/:type" element={<PromptsPage />} />
    </Route>
    <Route path="*" element={<NotFoundPage />} />
  </Routes>
);

export default App;
