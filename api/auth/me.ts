import type { VercelRequest, VercelResponse } from '@vercel/node';
import { parse as parseCookie } from 'cookie';
import jwt from 'jsonwebtoken';
import { getUserById } from '../db.js';

/**
 * Returns information about the currently authenticated user.
 */
export default async function handler(
    req: VercelRequest,
    res: VercelResponse
) {
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
    }

    try {
        const cookies = parseCookie(req.headers.cookie || '');
        const token = cookies.session;

        if (!token) {
            res.json({ authenticated: false });
            return;
        }

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            res.status(500).json({ error: 'Server configuration error' });
            return;
        }

        const payload = jwt.verify(token, jwtSecret) as { userId: number };
        const user = await getUserById(payload.userId);

        if (!user) {
            res.json({ authenticated: false });
            return;
        }

        res.status(200).json({
            authenticated: true,
            user: {
                id: user.id,
                workspace_name: user.workspace_name,
                workspace_id: user.notion_workspace_id
            }
        });
    } catch (error) {
        console.error('Auth verification error:', error);
        res.status(401).json({ authenticated: false, error: 'Invalid or expired session.' });
    }
}
