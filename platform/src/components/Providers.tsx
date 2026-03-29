"use client";

import ErrorBoundary from "./ErrorBoundary";

/**
 * Client-Side Providers
 * Umschließt die App mit Error Boundary und zukünftigen Providern.
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      {children}
    </ErrorBoundary>
  );
}
