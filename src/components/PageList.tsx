import type { PageInfo, User } from '../types';
import { Header } from './Header';

interface Props {
    user: User;
    pages: PageInfo[];
    isLoadingPages: boolean;
    pagesError: string | null;
    fetchPages: () => void;
    onDisconnect: () => void;
    onDownload: (pageId: string, pageTitle: string) => void;
    downloadProgress: Record<string, number>;
    downloadErrors: Record<string, string>;
}

export function PageList({
    user,
    pages,
    isLoadingPages,
    pagesError,
    fetchPages,
    onDisconnect,
    onDownload,
    downloadProgress,
    downloadErrors
}: Props) {
    const formatDate = (iso: string) => {
        if (!iso) return '';
        const d = new Date(iso);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    return (
        <div className="w-full max-w-xl">
            <Header subtitle="Select a page to download as a beautifully formatted PDF." />

            <div className="glass-card p-6">
                <div className="user-info mb-5">
                    <div className="flex items-center gap-2">
                        <span className="user-avatar">✦</span>
                        <span className="text-sm text-[var(--text-secondary)]">
                            {user.workspaceName}
                        </span>
                    </div>
                    <button className="disconnect-btn" onClick={onDisconnect}>
                        Disconnect
                    </button>
                </div>

                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                        Your Pages
                    </h2>
                    <span className="text-xs text-[var(--text-muted)]">
                        {pages.length} page{pages.length !== 1 ? 's' : ''}
                    </span>
                </div>

                {isLoadingPages ? (
                    <div className="page-list">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="page-item-skeleton">
                                <div className="skeleton-icon" />
                                <div className="skeleton-text">
                                    <div className="skeleton-line w-3/4" />
                                    <div className="skeleton-line w-1/3" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : pagesError ? (
                    <div className="page-list-error">
                        ⚠️ {pagesError}
                        <button className="page-retry-btn" onClick={fetchPages}>
                            Try Again
                        </button>
                    </div>
                ) : pages.length === 0 ? (
                    <div className="empty-state">
                        <p>No pages found.</p>
                        <span className="empty-subtext">
                            Make sure you granted access to specific pages during login.
                        </span>
                    </div>
                ) : (
                    <div className="page-list">
                        {pages.map((page) => {
                            const progress = downloadProgress[page.id];
                            const error = downloadErrors[page.id];
                            const isDownloading = progress !== undefined && progress < 100;
                            const isDone = progress === 100;
                            const isError = error !== undefined;

                            return (
                                <div key={page.id} className="page-item-wrapper">
                                    <div className="page-item">
                                        <div className="page-item-info">
                                            <span className="page-icon">{page.icon || '📄'}</span>
                                            <div className="page-text">
                                                <div className="page-title">{page.title || 'Untitled'}</div>
                                                <div className="page-meta">
                                                    Edited {formatDate(page.lastEdited)}
                                                </div>
                                            </div>
                                        </div>

                                        <button
                                            className={`page-download-btn ${isDownloading ? 'downloading' : ''}`}
                                            onClick={() => onDownload(page.id, page.title)}
                                            disabled={isDownloading && !isError}
                                        >
                                            {isDone
                                                ? '✅ Done'
                                                : isDownloading
                                                    ? '⬇ ...'
                                                    : isError
                                                        ? '↻ Retry'
                                                        : '⬇ PDF'}
                                        </button>
                                    </div>

                                    {(isDownloading || isError) && !isDone && (
                                        <div className="page-item-status">
                                            {isError ? (
                                                <div className="page-error" style={{ fontSize: '0.8rem', color: '#ff6b6b', marginTop: '4px' }}>
                                                    ⚠️ {error}
                                                </div>
                                            ) : (
                                                <div className="page-progress-bar mt-2 bg-gray-200 rounded-full h-1.5 dark:bg-gray-700">
                                                    <div
                                                        className="page-progress-fill bg-blue-600 h-1.5 rounded-full"
                                                        style={{ width: `${progress || 0}%`, transition: 'width 0.3s ease' }}
                                                    ></div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="text-center mt-6">
                <p className="text-xs text-[var(--text-muted)]">
                    Your data stays private. We only access the pages you share.
                </p>
            </div>
        </div>
    );
}
