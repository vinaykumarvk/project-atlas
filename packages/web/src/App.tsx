import { useRoutes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { routes } from './router';

export function App() {
  const routeElement = useRoutes(routes);

  return <AuthProvider>{routeElement}</AuthProvider>;
}
