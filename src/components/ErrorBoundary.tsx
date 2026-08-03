import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error("Unhandled error:", error, info);
    }
  }

  render() {
    if (this.state.hasError) {
      // Neutral, recipe-themed fallback only — never mentions safety features here.
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background px-8 text-center">
          <div className="text-5xl mb-4">🍲</div>
          <h1 className="font-display text-xl font-bold text-foreground">Something went wrong</h1>
          <p className="text-muted-foreground mt-2 text-sm">Pull to refresh and try again.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
