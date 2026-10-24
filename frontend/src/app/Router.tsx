import { useEffect, useState } from 'react';
import { matchRoute, type RouteMatch } from '../shared/router';
import type React from 'react';

export interface Route {
  pattern: string;
  component: (match: RouteMatch) => React.ReactElement;
  title?: string;
}

export interface RouterProps {
  routes: Route[];
  fallback?: () => React.ReactElement;
}

export function Router({ routes, fallback }: RouterProps) {
  const [location, setLocation] = useState(() => window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setLocation(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  for (const route of routes) {
    const match = matchRoute(route.pattern, location);
    if (match) {
      if (route.title) {
        document.title = route.title;
      }
      return route.component(match);
    }
  }

  if (fallback) {
    return fallback();
  }

  return (
    <main role="main" style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>404 — Not Found</h1>
      <p>The requested page does not exist.</p>
      <a href="/">Return to home</a>
    </main>
  );
}
