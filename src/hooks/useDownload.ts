import { useState, useRef } from 'react';

export function useDownload(setUser: (user: any) => void) {
    const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
    const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});
    const progressIntervals = useRef<Record<string, ReturnType<typeof setInterval>>>({});

    const animateProgress = (pageId: string, target: number) => {
        if (progressIntervals.current[pageId]) {
            clearInterval(progressIntervals.current[pageId]);
        }
        progressIntervals.current[pageId] = setInterval(() => {
            setDownloadProgress((prev) => {
                const current = prev[pageId] || 0;
                if (current >= target - 1) {
                    clearInterval(progressIntervals.current[pageId]);
                    return { ...prev, [pageId]: target };
                }
                const remaining = target - current;
                const increment = Math.max(0.5, remaining * 0.1 + Math.random() * 0.5);
                return {
                    ...prev,
                    [pageId]: Math.min(current + increment, target),
                };
            });
        }, 300);
    };

    const handleDownloadPage = async (pageId: string, pageTitle: string) => {
        setDownloadProgress((prev) => ({ ...prev, [pageId]: 0 }));
        setDownloadErrors((prev) => {
            const next = { ...prev };
            delete next[pageId];
            return next;
        });

        animateProgress(pageId, 40);

        try {
            const genTimer = setTimeout(() => {
                animateProgress(pageId, 85);
            }, 3000);

            const res = await fetch('/api/generate-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pageId }),
            });

            clearTimeout(genTimer);

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                if (res.status === 401) {
                    setUser(null); // force disconnect
                }
                throw new Error(errData.error || 'Failed to generate PDF');
            }

            animateProgress(pageId, 95);

            const blob = await res.blob();
            if (blob.size === 0) throw new Error('Received an empty PDF.');

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${pageTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'notion-export'}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            if (progressIntervals.current[pageId]) {
                clearInterval(progressIntervals.current[pageId]);
            }
            setDownloadProgress((prev) => ({ ...prev, [pageId]: 100 }));

            setTimeout(() => {
                setDownloadProgress((prev) => {
                    const next = { ...prev };
                    delete next[pageId];
                    return next;
                });
            }, 4000);
        } catch (err: any) {
            console.error('Download failed:', err);
            if (progressIntervals.current[pageId]) {
                clearInterval(progressIntervals.current[pageId]);
            }
            setDownloadErrors((prev) => ({ ...prev, [pageId]: err.message }));
            setDownloadProgress((prev) => {
                const next = { ...prev };
                delete next[pageId];
                return next;
            });
        }
    };

    const clearDownloads = () => {
        setDownloadProgress({});
        setDownloadErrors({});
        Object.values(progressIntervals.current).forEach(clearInterval);
        progressIntervals.current = {};
    };

    return { downloadProgress, downloadErrors, handleDownloadPage, clearDownloads };
}
