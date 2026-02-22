'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * ErrorBoundary
 *
 * Catches render errors in child components and displays a recovery UI
 * instead of crashing the entire application.
 *
 * Usage:
 *   <ErrorBoundary name="AgentPanel">
 *     <AgentPanel />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ errorInfo });
        console.error(`[ErrorBoundary:${this.props.name || 'unknown'}]`, error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-full w-full bg-obsidian/80 backdrop-blur-sm p-6 text-center">
                    <div className="bg-[#1a1a1a] rounded-xl border border-red-500/20 p-8 max-w-md shadow-2xl">
                        <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-4" />
                        <h3 className="text-white/90 font-semibold text-lg mb-2">
                            Something went wrong
                        </h3>
                        <p className="text-white/50 text-sm mb-1">
                            {this.props.name ? `Error in ${this.props.name}` : 'A component crashed'}
                        </p>
                        <p className="text-red-400/70 text-xs font-mono mb-6 break-all">
                            {this.state.error?.message?.slice(0, 150) || 'Unknown error'}
                        </p>
                        <button
                            onClick={this.handleRetry}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white/80 rounded-lg transition-colors text-sm"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Try Again
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
