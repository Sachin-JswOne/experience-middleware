import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import ProtectedLayout from '@/components/features/layout/ProtectedLayout';
import LoginPage from '@/pages/LoginPage';
import OAuth2Redirect from '@/pages/OAuth2Redirect';
import NotFoundPage from '@/pages/NotFoundPage';

// Heavy pages (recharts etc.) load on demand so the login screen ships a
// small entry chunk.
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const PromptsPage = lazy(() => import('@/pages/PromptsPage'));

const PageFallback = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
    <CircularProgress size={28} />
  </Box>
);

const App = () => (
  <Suspense fallback={<PageFallback />}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/oauth2" element={<OAuth2Redirect />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/prompts" element={<PromptsPage />} />
        <Route path="/prompts/:type" element={<PromptsPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  </Suspense>
);

export default App;
