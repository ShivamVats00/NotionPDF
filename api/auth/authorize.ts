import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

/**
 * Initiates the Notion OAuth flow.
 * Redirects the user to Notion's consent screen.
 */
export default async function handler(
    req: VercelRequest,
    res: VercelResponse
) {
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
    }

    const clientId = process.env.NOTION_OAUTH_CLIENT_ID;
    const redirectUri = process.env.NOTION_REDIRECT_URI || 'http://localhost:5173/api/auth/callback';

    if (!clientId) {
        res.status(500).json({ error: 'NOTION_OAUTH_CLIENT_ID is not configured.' });
        return;
    }

    const state = crypto.randomBytes(16).toString('hex');

    const authUrl = new URL('https://api.notion.com/v1/oauth/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('owner', 'user');
    authUrl.searchParams.set('state', state);

    res.setHeader('Set-Cookie', `oauth_state=${state}; HttpOnly; Path=/; SameSite=Lax; Max-Age=600`);
    res.redirect(302, authUrl.toString());
}
