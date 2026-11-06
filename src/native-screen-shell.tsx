import React from 'react';

type NativeScreenShellProps = {
    isNativeApp: boolean;
    title: string;
    onBack: () => void;
    children: React.ReactNode;
};

export const NativeScreenShell: React.FC<NativeScreenShellProps> = ({ isNativeApp, title, onBack, children }) => {
    if (!isNativeApp) return <>{children}</>;

    return (
        <div className="container app-container native-route-container">
            <div className="frame">
                <header className="native-header">
                    <div className="native-header-bar">
                        <button type="button" className="header-back-button" onClick={onBack} aria-label="Back">
                            <span className="header-back-chevron" aria-hidden="true">‹</span>
                            <span className="header-back-label">Back</span>
                        </button>
                        <span className="native-header-screen-title">{title}</span>
                    </div>
                </header>
                <main className="page-content main-viewport">{children}</main>
            </div>
        </div>
    );
};