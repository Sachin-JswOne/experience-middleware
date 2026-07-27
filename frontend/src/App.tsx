import { Suspense, lazy } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import ErrorBoundary from '@/components/features/layout/ErrorBoundary';
import ProtectedLayout from '@/components/features/layout/ProtectedLayout';
import LoginPage from '@/pages/LoginPage';
import OAuth2Redirect from '@/pages/OAuth2Redirect';
import NotFoundPage from '@/pages/NotFoundPage';

// Heavy pages (recharts etc.) load on demand so the login screen ships a
// small entry chunk.
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const PromptsPage = lazy(() => import('@/pages/PromptsPage'));
const ValkeyAdminPage = lazy(() => import('@/pages/ValkeyAdminPage'));

const PageFallback = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
    <CircularProgress size={28} />
  </Box>
);

const App = () => {
  const location = useLocation();

  return (
    // Keyed on the path so navigating away from a page that threw (or whose
    // chunk failed to load) clears the error instead of stranding the user.
    <ErrorBoundary scope="route" resetKey={location.pathname}>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/oauth2" element={<OAuth2Redirect />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/prompts" element={<PromptsPage />} />
            <Route path="/prompts/:type" element={<PromptsPage />} />
            <Route path="/cache-admin" element={<ValkeyAdminPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
};

export default App;
