import { useState, useEffect } from 'react';
import type { PageInfo, User } from '../types';

export function usePages(user: User | null, setIsLoadingUser: (val: boolean) => void) {
    const [pages, setPages] = useState<PageInfo[]>([]);
    const [isLoadingPages, setIsLoadingPages] = useState(false);
    const [pagesError, setPagesError] = useState<string | null>(null);

    const fetchPages = () => {
        setIsLoadingPages(true);
        fetch('/api/pages')
            .then((res) => res.json())
            .then((data) => {
                if (data.pages) {
                    setPages(data.pages);
                } else if (data.error) {
                    setPagesError(data.error);
                }
            })
            .catch((err) => {
                console.error('Failed to fetch pages:', err);
                setPagesError('Failed to load pages.');
            })
            .finally(() => {
                setIsLoadingPages(false);
                setIsLoadingUser(false);
            });
    };

    useEffect(() => {
        if (user) {
            fetchPages();
        } else {
            setPages([]);
        }
    }, [user]);

    return { pages, setPages, isLoadingPages, pagesError, fetchPages };
}
