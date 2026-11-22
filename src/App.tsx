import { createBrowserRouter, Link, RouterProvider } from 'react-router-dom';
import LandingPage from './pages/landingpage/LandingPage'
import { CommonStateProvider } from './state/commonState'
import { ExpertShell } from './pages/expert/ExpertShell';
import { CommonDashboard } from './pages/standard/CommonDashboard';

const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <LandingPage
        standardHref="/standard"
        expertHref="/expert"
        renderLink={({ href, className, children }) => (
          <Link to={href} className={className}>
            {children}
          </Link>
        )}
      />
    ),
  },
  { path: "/standard", element: <CommonDashboard /> },
  { path: "/expert", element: <ExpertShell /> },
]);

function App() {
  return (
    <CommonStateProvider>
      <RouterProvider router={router} />
    </CommonStateProvider>
  );
}

export default App
