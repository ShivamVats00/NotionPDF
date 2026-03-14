import React from 'react';

export function Layout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <div className="bg-mesh" />
            <div className="relative z-10 min-h-screen flex items-center justify-center p-6">
                {children}
            </div>
        </>
    );
}
