import React from 'react';

type RealtimeErrorBoundaryProps = {
    children: React.ReactNode;
};

type RealtimeErrorBoundaryState = {
    hasError: boolean;
};

export class RealtimeErrorBoundary extends React.Component<RealtimeErrorBoundaryProps, RealtimeErrorBoundaryState> {
    state: RealtimeErrorBoundaryState = { hasError: false };

    static getDerivedStateFromError(): RealtimeErrorBoundaryState {
        return { hasError: true };
    }

    componentDidCatch(error: Error) {
        console.error('Realtime sync failed.', error);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div role="alert" className="runtime-warning-banner">
                    <strong className="runtime-warning-title">Live updates paused.</strong>
                    <span className="runtime-warning-item">Refresh the page to reconnect.</span>
                    <button type="button" className="account-text-btn" onClick={() => this.setState({ hasError: false })}>Reconnect</button>
                </div>
            );
        }

        return this.props.children;
    }
}
