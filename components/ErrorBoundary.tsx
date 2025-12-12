import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Bug } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): Partial<State> {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        this.setState({ errorInfo });
        
        // Optional: Send error to logging service
        // logErrorToService(error, errorInfo);
    }

    private handleReload = () => {
        window.location.reload();
    };

    private handleReset = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="min-h-screen flex items-center justify-center p-4" 
                     style={{ background: 'var(--color-surface)' }}>
                    <div 
                        className="max-w-md w-full p-8 rounded-3xl text-center"
                        style={{ 
                            background: 'var(--glass-bg)',
                            backdropFilter: 'blur(20px)',
                            border: '1px solid var(--glass-border)',
                            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)'
                        }}
                    >
                        {/* Error Icon */}
                        <div 
                            className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center"
                            style={{ 
                                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.1) 100%)',
                                border: '2px solid rgba(239, 68, 68, 0.3)'
                            }}
                        >
                            <AlertTriangle size={40} style={{ color: '#EF4444' }} />
                        </div>

                        {/* Title */}
                        <h1 
                            className="text-2xl font-bold mb-2"
                            style={{ color: 'var(--color-on-surface)' }}
                        >
                            Bir Hata Oluştu
                        </h1>
                        
                        {/* Description */}
                        <p 
                            className="text-sm mb-6"
                            style={{ color: 'var(--color-on-surface-variant)' }}
                        >
                            Uygulama beklenmeyen bir hatayla karşılaştı. 
                            Lütfen sayfayı yenileyerek tekrar deneyin.
                        </p>

                        {/* Error Details (collapsible) */}
                        {this.state.error && (
                            <details className="text-left mb-6">
                                <summary 
                                    className="cursor-pointer text-xs font-medium flex items-center gap-2 p-3 rounded-xl mb-2"
                                    style={{ 
                                        background: 'var(--color-surface-container)',
                                        color: 'var(--color-on-surface-variant)'
                                    }}
                                >
                                    <Bug size={14} />
                                    Hata Detayları
                                </summary>
                                <div 
                                    className="p-3 rounded-xl text-xs font-mono overflow-auto max-h-40"
                                    style={{ 
                                        background: 'var(--color-surface-container)',
                                        color: 'var(--color-error)'
                                    }}
                                >
                                    <p className="font-bold mb-2">{this.state.error.name}</p>
                                    <p className="whitespace-pre-wrap">{this.state.error.message}</p>
                                    {this.state.errorInfo?.componentStack && (
                                        <pre className="mt-2 text-[10px] opacity-70 whitespace-pre-wrap">
                                            {this.state.errorInfo.componentStack}
                                        </pre>
                                    )}
                                </div>
                            </details>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3">
                            <button
                                onClick={this.handleReset}
                                className="flex-1 px-4 py-3 rounded-xl font-medium text-sm transition-all hover:scale-105"
                                style={{ 
                                    background: 'var(--color-surface-container)',
                                    color: 'var(--color-on-surface)'
                                }}
                            >
                                Tekrar Dene
                            </button>
                            <button
                                onClick={this.handleReload}
                                className="flex-1 px-4 py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all hover:scale-105"
                                style={{ 
                                    background: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-primary-600) 100%)',
                                    color: 'white',
                                    boxShadow: '0 4px 15px rgba(59, 130, 246, 0.3)'
                                }}
                            >
                                <RefreshCw size={16} />
                                Sayfayı Yenile
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
