import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SerializeOptions, serialize } from 'cookie';
import jwt from 'jsonwebtoken';
import { upsertUser } from '../db.js';

/**
 * Handles the OAuth redirect callback from Notion.
 * Exchanges the authorization code for an access token and establishes a user session.
 */
export default async function handler(
    req: VercelRequest,
    res: VercelResponse
): Promise<void> {
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
    }

    const { code, state, error } = req.query;

    if (error) {
        res.redirect(`/?error=${encodeURIComponent(error as string)}`);
        return;
    }

    if (!code) {
        res.status(400).json({ error: 'Missing authorization code.' });
        return;
    }

    const clientId = process.env.NOTION_OAUTH_CLIENT_ID;
    const clientSecret = process.env.NOTION_OAUTH_CLIENT_SECRET;
    const jwtSecret = process.env.JWT_SECRET;
    const redirectUri = process.env.NOTION_REDIRECT_URI || 'http://localhost:5173/api/auth/callback';

    if (!clientId || !clientSecret || !jwtSecret) {
        res.status(500).json({ error: 'OAuth environment variables not configured.' });
        return;
    }

    try {
        const tokenResponse = await fetch('https://api.notion.com/v1/oauth/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                grant_type: 'authorization_code',
                code: code as string,
                redirect_uri: redirectUri,
            }),
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok) {
            console.error('Notion Token Error:', tokenData);
            res.redirect(`/?error=${encodeURIComponent(tokenData.error_description || 'Failed to exchange token')}`);
            return;
        }

        const tokenDataTyped = tokenData as {
            access_token: string;
            workspace_id: string;
            workspace_name: string;
            bot_id: string;
        };

        const user = await upsertUser({
            notionWorkspaceId: tokenDataTyped.workspace_id,
            workspaceName: tokenDataTyped.workspace_name,
            accessToken: tokenDataTyped.access_token,
            botId: tokenDataTyped.bot_id
        });

        const sessionToken = jwt.sign(
            { userId: user.id, workspaceId: user.notion_workspace_id },
            jwtSecret,
            { expiresIn: '30d' }
        );

        const cookieOptions: SerializeOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 30 * 24 * 60 * 60, 
        };

        res.setHeader('Set-Cookie', serialize('session', sessionToken, cookieOptions));
        res.redirect('/');
    } catch (err) {
        console.error('OAuth Callback Error:', err);
        res.redirect('/?error=oauth_failed');
    }
}
