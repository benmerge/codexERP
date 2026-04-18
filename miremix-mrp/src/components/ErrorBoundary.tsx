import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends (React.Component as any) {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('ErrorBoundary caught an error', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const isPermissionError = this.state.error?.message?.includes('insufficient permissions');
      const displayMessage = isPermissionError 
        ? "Security Violation: Access denied for your current MiRemix account level."
        : "Production System Fault: The application encountered an unexpected interrupt.";

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 p-6 font-sans">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 border-l-8 border-amber-500">
            <h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter mb-2">MiRemix Alert</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6 border-b border-slate-100 pb-2">Diagnostic Interruption</p>
            <div className="bg-slate-50 p-4 rounded-xl mb-8 border border-slate-100">
              <p className="text-xs font-bold text-slate-600 leading-relaxed uppercase tracking-tight">
                {displayMessage}
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-amber-500 text-slate-900 font-black py-4 rounded-xl hover:bg-amber-400 transition-all uppercase text-xs tracking-widest shadow-lg shadow-amber-500/20"
            >
              Recalibrate System
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}


