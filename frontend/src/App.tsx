import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import RouteEditorPage from './pages/RouteEditorPage';
import CreateRoutePage from './pages/CreateRoutePage';
import PromptManagementPage from './pages/PromptManagementPage';
import PromptHistoryPage from './pages/PromptHistoryPage';

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <Navbar />
        {children}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedLayout>
                <DashboardPage />
              </ProtectedLayout>
            }
          />
          <Route
            path="/routes/new"
            element={
              <ProtectedLayout>
                <CreateRoutePage />
              </ProtectedLayout>
            }
          />
          <Route
            path="/routes/:id"
            element={
              <ProtectedLayout>
                <RouteEditorPage />
              </ProtectedLayout>
            }
          />
          <Route
            path="/segmentation/prompts"
            element={
              <ProtectedLayout>
                <PromptManagementPage />
              </ProtectedLayout>
            }
          />
          <Route
            path="/segmentation/prompts/history/:type"
            element={
              <ProtectedLayout>
                <PromptHistoryPage />
              </ProtectedLayout>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}