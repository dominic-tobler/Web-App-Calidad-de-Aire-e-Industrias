import { createBrowserRouter, Link, Navigate, RouterProvider } from 'react-router-dom';
import LandingPage from './pages/landingpage/LandingPage'
import { CommonStateProvider } from './state/commonState'
import { ExpertShell } from './pages/expert/ExpertShell';
import { CommonDashboard } from './pages/standard/CommonDashboard';
import { ROUTES } from './layouts/ViewNav';

const router = createBrowserRouter([
  {
    path: ROUTES.inicio,
    element: (
      <LandingPage
        standardHref={ROUTES.estandar}
        expertHref={ROUTES.experta}
        renderLink={({ href, className, children }) => (
          <Link to={href} className={className}>
            {children}
          </Link>
        )}
      />
    ),
  },
  { path: ROUTES.estandar, element: <CommonDashboard /> },
  { path: ROUTES.experta, element: <ExpertShell /> },
  // Rutas antiguas, por si alguien las guardó.
  { path: "/standard", element: <Navigate to={ROUTES.estandar} replace /> },
  { path: "/expert", element: <Navigate to={ROUTES.experta} replace /> },
]);

function App() {
  return (
    <CommonStateProvider>
      <RouterProvider router={router} />
    </CommonStateProvider>
  );
}

export default App
