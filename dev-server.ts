import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

process.env.IS_LOCAL = 'true';

async function startServer() {
    const app = express();
    const PORT = 3001;

    app.use(express.json({ limit: '10mb' }));

    app.get('/api/auth/authorize', async (req, res) => {
        const { default: handler } = await import('./api/auth/authorize.js');
        handler(req as any, res as any);
    });

    app.get('/api/auth/callback', async (req, res) => {
        const { default: handler } = await import('./api/auth/callback.js');
        await handler(req as any, res as any);
    });

    app.get('/api/auth/me', async (req, res) => {
        const { default: handler } = await import('./api/auth/me.js');
        handler(req as any, res as any);
    });

    app.post('/api/auth/logout', async (req, res) => {
        const { default: handler } = await import('./api/auth/logout.js');
        handler(req as any, res as any);
    });

    app.get('/api/pages', async (req, res) => {
        const { default: handler } = await import('./api/pages.js');
        await handler(req as any, res as any);
    });

    // ─── PDF Generation Route ───────────────────────────────────────────────────

    app.post('/api/generate-pdf', async (req, res) => {
        const startTime = Date.now();

        try {
            const {
                getNotionClient,
                buildPageTree,
                buildFullHtml,
                generatePdf,
                isValidNotionId,
                formatId,
            } = await import('./api/generate-pdf.js');

            // Authenticate user
            const { parse: parseCookie } = await import('cookie');
            const jwt = (await import('jsonwebtoken')).default;
            const { getUserById } = await import('./api/db.js');

            const cookies = parseCookie(req.headers.cookie || '');
            const sessionToken = cookies.session;

            if (!sessionToken) {
                res.status(401).json({ error: 'Not authenticated. Please connect with Notion first.' });
                return;
            }

            const jwtSecret = process.env.JWT_SECRET;
            if (!jwtSecret) {
                res.status(500).json({ error: 'JWT_SECRET not configured.' });
                return;
            }

            const payload = jwt.verify(sessionToken, jwtSecret) as { userId: number };
            const user = await getUserById(payload.userId);

            if (!user) {
                res.status(401).json({ error: 'User not found. Please reconnect with Notion.' });
                return;
            }

            const { pageId } = req.body || {};

            if (!pageId || typeof pageId !== 'string') {
                res.status(400).json({ error: 'Missing or invalid "pageId".' });
                return;
            }

            if (!isValidNotionId(pageId)) {
                res.status(400).json({ error: 'Invalid Notion page ID format.' });
                return;
            }

            const formattedId = formatId(pageId);
            console.log(`[API] Processing page: ${formattedId}`);

            // Phase 1: Fetch from Notion
            console.log(`[API] Fetching Notion content...`);
            const notion = getNotionClient(user.access_token);
            const pageTree = await buildPageTree(notion, formattedId);
            console.log(`[API] Fetched ${pageTree.blocks.length} blocks, ${pageTree.children.length} child pages (${Date.now() - startTime}ms)`);

            if (pageTree.blocks.length === 0 && pageTree.children.length === 0) {
                res.status(404).json({
                    error: 'Page is empty or inaccessible. Make sure it is shared with your Notion integration.',
                });
                return;
            }

            // Phase 2: Convert to HTML
            console.log(`[API] Building HTML...`);
            const fullHtml = buildFullHtml(pageTree);
            console.log(`[API] HTML built (${fullHtml.length} chars, ${Date.now() - startTime}ms)`);

            // Phase 3: Generate PDF
            console.log(`[API] Launching Puppeteer and generating PDF...`);
            const pdfBuffer = await generatePdf(fullHtml);
            console.log(`[API] PDF generated (${(pdfBuffer.length / 1024).toFixed(1)} KB, ${Date.now() - startTime}ms total)`);

            // Send PDF
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="notion-export.pdf"');
            res.setHeader('Content-Length', pdfBuffer.length.toString());
            res.end(pdfBuffer);
        } catch (err: any) {
            console.error(`[API] Error (${Date.now() - startTime}ms):`, err);

            const message =
                err?.code === 'object_not_found'
                    ? 'Page not found. Ensure the page is shared with your Notion integration.'
                    : err?.code === 'unauthorized'
                        ? 'Your Notion access may have been revoked. Please reconnect.'
                        : err?.message || 'An unexpected error occurred.';

            res.status(err?.status || 500).json({ error: message });
        }
    });

    const server = app.listen(PORT, () => {
        console.log(`\n  API dev server running at http://localhost:${PORT}`);
        console.log(`  Auth: http://localhost:${PORT}/api/auth/authorize`);
        console.log(`  POST http://localhost:${PORT}/api/generate-pdf\n`);
    });
    server.timeout = 300000; // 5 minutes for long-running PDF generation
}

startServer().catch(console.error);
