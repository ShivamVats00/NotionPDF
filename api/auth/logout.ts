import type { VercelRequest, VercelResponse } from '@vercel/node';
import { serialize } from 'cookie';

/**
 * Handles user logout by clearing the session cookie.
 */
export default function handler(
    req: VercelRequest,
    res: VercelResponse
) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
    }

    const cleared = serialize('session', '', {
        httpOnly: true,
        path: '/',
        maxAge: 0,
    });

    res.setHeader('Set-Cookie', cleared);
    res.json({ ok: true });
}
