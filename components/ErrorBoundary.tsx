import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Call the optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReload = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--color-surface)' }}>
          <div className="surface-card p-6 max-w-md w-full text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" 
                 style={{ backgroundColor: 'var(--color-error-container)' }}>
              <svg 
                className="w-8 h-8" 
                style={{ color: 'var(--color-error)' }}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-on-surface)' }}>
              Bir hata oluştu
            </h1>
            <p className="mb-4" style={{ color: 'var(--color-on-surface-variant)' }}>
              Uygulama beklenmeyen bir hatayla karşılaştı.
            </p>
            {this.state.error && (
              <div className="mb-4 p-3 rounded-lg text-left text-sm" 
                   style={{ 
                     backgroundColor: 'var(--color-surface-variant)',
                     color: 'var(--color-on-surface-variant)'
                   }}>
                <code>{this.state.error.message}</code>
              </div>
            )}
            <button 
              onClick={this.handleReload}
              className="btn-filled w-full"
            >
              Sayfayı Yenile
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
