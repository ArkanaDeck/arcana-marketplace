// @ts-ignore
import './main-layout.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MainLayout } from './main-layout';
import { RealtimeErrorBoundary } from './realtime-error-boundary';

const container = document.getElementById('app');

if (!container) {
    throw new Error("Failed to find the root element with id 'app'");
}

const root = createRoot(container);
root.render(
    <React.StrictMode>
        <RealtimeErrorBoundary>
            <MainLayout />
        </RealtimeErrorBoundary>
    </React.StrictMode>
);
