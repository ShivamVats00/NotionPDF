import { useState, useEffect } from 'react';
import type { User } from '../types';

export function useAuth() {
    const [user, setUser] = useState<User | null>(null);
    const [isLoadingUser, setIsLoadingUser] = useState(true);

    useEffect(() => {
        fetch('/api/auth/me')
            .then((res) => {
                if (!res.ok) throw new Error('Not logged in');
                return res.json();
            })
            .then((data) => {
                if (data.user) {
                    setUser({ workspaceName: data.user.workspace_name });
                } else {
                    setIsLoadingUser(false);
                }
            })
            .catch(() => {
                setIsLoadingUser(false);
            });
    }, []);

    const handleDisconnect = async (onDisconnect: () => void) => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            setUser(null);
            onDisconnect();
        } catch (err) {
            console.error('Logout failed:', err);
        }
    };

    const handleLogin = () => {
        window.location.href = '/api/auth/authorize';
    };

    return { user, setUser, isLoadingUser, setIsLoadingUser, handleDisconnect, handleLogin };
}
