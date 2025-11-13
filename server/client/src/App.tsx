import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import EntityPage from './pages/EntityPage';
import LoginPage from './pages/LoginPage';
import AdminUsersPage from './pages/AdminUsersPage';
import PageEditor from './pages/PageEditor';
import { useSession } from './store/useSession';
import { useEntities } from './store/useEntities';
import { fetchStructure } from './services/origami';

const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  const { isAuthenticated } = useSession();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const AdminRoute = ({ children }: { children: JSX.Element }) => {
  const { role } = useSession();
  if (role !== 'admin') {
    return <Navigate to="/pages" replace />;
  }
  return children;
};

export const App = () => {
  const { isAuthenticated } = useSession();
  const { setStructure } = useEntities();
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      setInitializing(false);
      return;
    }
    let active = true;
    const loadStructure = async () => {
      try {
        const structure = await fetchStructure();
        if (active) {
          setStructure(structure.entities);
          setError('');
        }
      } catch (err) {
        if (active) {
          setError('Unable to load the Origami structure.');
        }
      } finally {
        if (active) {
          setInitializing(false);
        }
      }
    };
    setInitializing(true);
    loadStructure();
    return () => {
      active = false;
    };
  }, [isAuthenticated, setStructure]);

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (initializing) {
    return <p className="p-6 text-sm text-muted">Loading the portal…</p>;
  }

  return (
    <div className="flex min-h-screen bg-[var(--color-background)]">
      <Sidebar />
      <main className="flex-1 bg-transparent">
        {error ? (
          <p className="px-6 pt-6 text-sm text-red-500">{error}</p>
        ) : null}
        <Routes>
          <Route
            path="/pages"
            element={
              <ProtectedRoute>
                <PageEditor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pages/:pageId"
            element={
              <ProtectedRoute>
                <PageEditor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/entity/:entityName"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <EntityPage />
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdminUsersPage />
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/pages" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
