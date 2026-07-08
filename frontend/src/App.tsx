import { Routes, Route } from 'react-router-dom';
import ProtectedLayout from '@/components/features/layout/ProtectedLayout';
import LoginPage from '@/pages/LoginPage';
import OAuth2Redirect from '@/pages/OAuth2Redirect';
import DashboardPage from '@/pages/DashboardPage';
import NotFoundPage from '@/pages/NotFoundPage';

const App = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/oauth2" element={<OAuth2Redirect />} />
    <Route element={<ProtectedLayout />}>
      <Route path="/" element={<DashboardPage />} />
    </Route>
    <Route path="*" element={<NotFoundPage />} />
  </Routes>
);

export default App;
