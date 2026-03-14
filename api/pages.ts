import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from '@notionhq/client';
import { parse as parseCookie } from 'cookie';
import jwt from 'jsonwebtoken';
import { getUserById } from './db.js';

export interface PageInfo {
    id: string;
    title: string;
    icon: string | null;
    lastEdited: string;
}

/**
 * Fetches the list of accessible Notion pages for the authenticated user.
 * Filters out sub-pages so only top-level shared pages are shown.
 */
export default async function handler(
    req: VercelRequest,
    res: VercelResponse
): Promise<void> {
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        res.status(500).json({ error: 'Server configuration error.' });
        return;
    }

    // Authenticate
    let accessToken: string;
    try {
        const cookies = parseCookie(req.headers.cookie || '');
        const sessionToken = cookies.session;
        if (!sessionToken) {
            res.status(401).json({ error: 'Not authenticated.' });
            return;
        }

        const payload = jwt.verify(sessionToken, jwtSecret) as { userId: number };
        const user = await getUserById(payload.userId);
        if (!user) {
            res.status(401).json({ error: 'User not found.' });
            return;
        }
        accessToken = user.access_token;
    } catch {
        res.status(401).json({ error: 'Session expired.' });
        return;
    }

    try {
        const notion = new Client({ auth: accessToken });
        const allPages: (PageInfo & { parentPageId: string | null })[] = [];
        let hasMore = true;
        let startCursor: string | undefined = undefined;

        while (hasMore) {
            const response = await notion.search({
                filter: { property: 'object', value: 'page' },
                sort: { direction: 'descending', timestamp: 'last_edited_time' },
                start_cursor: startCursor,
                page_size: 100,
            });

            for (const page of response.results) {
                if (!('properties' in page)) continue;

                // Extract title
                let title = 'Untitled';
                const props = page.properties;
                const titleProp =
                    props['title'] ||
                    props['Name'] ||
                    Object.values(props).find((p: any) => p.type === 'title');

                if (titleProp && 'title' in (titleProp as any)) {
                    const titleArr = (titleProp as any).title;
                    if (Array.isArray(titleArr) && titleArr.length > 0) {
                        title = titleArr.map((t: any) => t.plain_text).join('') || 'Untitled';
                    }
                }

                // Extract icon
                let icon: string | null = null;
                if ('icon' in page && page.icon) {
                    if (page.icon.type === 'emoji') {
                        icon = page.icon.emoji;
                    }
                }

                // Extract parent page ID (to filter out subpages later)
                const parent = (page as any).parent;
                const parentPageId = parent?.type === 'page_id' ? parent.page_id : null;

                allPages.push({
                    id: page.id,
                    title,
                    icon,
                    lastEdited: (page as any).last_edited_time || '',
                    parentPageId,
                });
            }

            hasMore = response.has_more;
            startCursor = response.next_cursor ?? undefined;
        }

        // Filter out subpages: only keep pages whose parent ID is not in the overall results list
        const allIds = new Set(allPages.map((p) => p.id));
        const pages: PageInfo[] = allPages
            .filter((p) => !p.parentPageId || !allIds.has(p.parentPageId))
            .map(({ parentPageId: _, ...rest }) => rest);

        res.json({ pages });
    } catch (err: any) {
        console.error('Failed to fetch pages:', err);
        res.status(500).json({ error: 'Failed to fetch pages from Notion.' });
    }
}
