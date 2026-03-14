import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from '@notionhq/client';
import type {
    BlockObjectResponse,
    RichTextItemResponse,
} from '@notionhq/client/build/src/api-endpoints';
import { parse as parseCookie } from 'cookie';
import jwt from 'jsonwebtoken';
import { getUserById } from './db.js';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface PageTree {
    title: string;
    blocks: BlockObjectResponse[];
    children: PageTree[];
}

/**
 * Helper to initialize the Notion SDK client with a user's access token.
 */
export function getNotionClient(accessToken: string): Client {
    return new Client({ auth: accessToken });
}

/**
 * Wrapper for API calls to Notion with exponential backoff on rate limits (429) or server errors (500+).
 */
async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 1000
): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err: any) {
            const isRateLimit = err?.status === 429;
            const isServerError = err?.status >= 500;
            if (attempt === maxRetries || (!isRateLimit && !isServerError)) {
                throw err;
            }
            const retryAfter = err?.headers?.['retry-after'];
            const delay = retryAfter
                ? parseInt(retryAfter, 10) * 1000
                : baseDelay * Math.pow(2, attempt);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
    throw new Error('Exhausted retries');
}

/**
 * Fetches all child blocks for a given block ID, handling pagination.
 * Recursively fetches nested children for blocks that contain them (toggles, lists, etc).
 */
async function fetchAllBlocks(
    notion: Client,
    blockId: string
): Promise<BlockObjectResponse[]> {
    const blocks: BlockObjectResponse[] = [];
    let cursor: string | undefined = undefined;

    do {
        const response = await withRetry(() =>
            notion.blocks.children.list({
                block_id: blockId,
                start_cursor: cursor,
                page_size: 100,
            })
        );

        for (const block of response.results) {
            if ('type' in block) {
                const b = block as BlockObjectResponse;
                if (b.has_children && b.type !== 'child_page' && b.type !== 'child_database') {
                    const childBlocks = await fetchAllBlocks(notion, b.id);
                    (b as any)._children = childBlocks;
                }
                blocks.push(b);
            }
        }

        cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
    } while (cursor);

    return blocks;
}

/**
 * Helper to fetch a page's title directly from its properties.
 */
async function getPageTitle(
    notion: Client,
    pageId: string
): Promise<string> {
    try {
        const page = await withRetry(() => notion.pages.retrieve({ page_id: pageId }));
        if ('properties' in page) {
            const props = page.properties;
            const titleProp = props['title'] || props['Name'] || Object.values(props).find(
                (p: any) => p.type === 'title'
            );
            if (titleProp && 'title' in (titleProp as any)) {
                const titleArr = (titleProp as any).title as RichTextItemResponse[];
                return titleArr.map((t) => t.plain_text).join('') || 'Untitled';
            }
        }
    } catch {
        // Silently fall back to 'Untitled'
    }
    return 'Untitled';
}

/**
 * Builds a hierarchical tree of pages and their associated blocks.
 * Used for exporting a page and its sub-pages recursively.
 */
export async function buildPageTree(
    notion: Client,
    pageId: string,
    depth = 0,
    maxDepth = 5
): Promise<PageTree> {
    const title = await getPageTitle(notion, pageId);
    const blocks = await fetchAllBlocks(notion, pageId);
    const children: PageTree[] = [];

    if (depth < maxDepth) {
        for (const block of blocks) {
            if (block.type === 'child_page') {
                const childTree = await buildPageTree(notion, block.id, depth + 1, maxDepth);
                children.push(childTree);
            }
        }
    }

    return { title, blocks, children };
}

function renderRichText(richTexts: RichTextItemResponse[]): string {
    if (!richTexts || richTexts.length === 0) return '';

    return richTexts
        .map((rt) => {
            let text = escapeHtml(rt.plain_text);

            if (rt.annotations.bold) text = `<strong>${text}</strong>`;
            if (rt.annotations.italic) text = `<em>${text}</em>`;
            if (rt.annotations.strikethrough) text = `<s>${text}</s>`;
            if (rt.annotations.underline) text = `<u>${text}</u>`;
            if (rt.annotations.code)
                text = `<code class="inline-code">${text}</code>`;

            if (rt.annotations.color && rt.annotations.color !== 'default') {
                const color = rt.annotations.color;
                if (color.endsWith('_background')) {
                    text = `<span style="background-color: var(--notion-${color})">${text}</span>`;
                } else {
                    text = `<span style="color: var(--notion-${color})">${text}</span>`;
                }
            }

            if (rt.href) {
                text = `<a href="${escapeHtml(rt.href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
            }

            return text;
        })
        .join('');
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

// ─── Block → HTML ───────────────────────────────────────────────────────────────

function getMediaUrl(
    block: any,
    mediaType: 'image' | 'video' | 'file'
): string {
    const media = block[mediaType];
    if (!media) return '';
    if (media.type === 'external') return media.external?.url || '';
    if (media.type === 'file') return media.file?.url || '';
    return '';
}

function blockToHtml(block: BlockObjectResponse): string {
    const type = block.type;
    const data = (block as any)[type];
    const children: BlockObjectResponse[] = (block as any)._children || [];
    const childrenHtml = children.length > 0 ? blocksToHtml(children) : '';

    switch (type) {
        case 'heading_1': {
            const content = renderRichText(data.rich_text);
            if (data.is_toggleable && childrenHtml) {
                return `<details class="toggle-block" open><summary><h1 style="display:inline">${content}</h1></summary><div class="toggle-content">${childrenHtml}</div></details>`;
            }
            return `<h1>${content}</h1>`;
        }
        case 'heading_2': {
            const content = renderRichText(data.rich_text);
            if (data.is_toggleable && childrenHtml) {
                return `<details class="toggle-block" open><summary><h2 style="display:inline">${content}</h2></summary><div class="toggle-content">${childrenHtml}</div></details>`;
            }
            return `<h2>${content}</h2>`;
        }
        case 'heading_3': {
            const content = renderRichText(data.rich_text);
            if (data.is_toggleable && childrenHtml) {
                return `<details class="toggle-block" open><summary><h3 style="display:inline">${content}</h3></summary><div class="toggle-content">${childrenHtml}</div></details>`;
            }
            return `<h3>${content}</h3>`;
        }

        case 'paragraph':
            return `<p>${renderRichText(data.rich_text) || '&nbsp;'}${childrenHtml ? `<div class="nested-content">${childrenHtml}</div>` : ''}</p>`;

        case 'bulleted_list_item':
            return `<li class="bulleted">${renderRichText(data.rich_text)}${childrenHtml ? `<div class="nested-content">${childrenHtml}</div>` : ''}</li>`;
        case 'numbered_list_item':
            return `<li class="numbered">${renderRichText(data.rich_text)}${childrenHtml ? `<div class="nested-content">${childrenHtml}</div>` : ''}</li>`;

        case 'to_do': {
            const checked = data.checked ? 'checked' : '';
            const strikeClass = data.checked ? ' class="todo-done"' : '';
            return `<div class="todo-item"><input type="checkbox" ${checked} disabled /><span${strikeClass}>${renderRichText(data.rich_text)}</span>${childrenHtml ? `<div class="nested-content">${childrenHtml}</div>` : ''}</div>`;
        }

        case 'toggle': {
            return `<details class="toggle-block" open><summary>${renderRichText(data.rich_text)}</summary><div class="toggle-content">${childrenHtml}</div></details>`;
        }

        case 'code': {
            const lang = data.language || 'plain text';
            const code = renderRichText(data.rich_text);
            return `<div class="code-block"><div class="code-header">${escapeHtml(lang)}</div><pre><code>${code}</code></pre></div>`;
        }

        case 'quote':
            return `<blockquote>${renderRichText(data.rich_text)}${childrenHtml ? `<div class="nested-content">${childrenHtml}</div>` : ''}</blockquote>`;

        case 'callout': {
            const icon = data.icon?.emoji || data.icon?.external?.url || '💡';
            const iconHtml = icon.startsWith('http')
                ? `<img src="${escapeHtml(icon)}" class="callout-icon" alt="" />`
                : `<span class="callout-icon">${icon}</span>`;
            return `<div class="callout">${iconHtml}<div class="callout-content">${renderRichText(data.rich_text)}${childrenHtml ? `<div class="nested-content">${childrenHtml}</div>` : ''}</div></div>`;
        }

        case 'image': {
            const url = getMediaUrl(block, 'image');
            const caption = data.caption ? renderRichText(data.caption) : '';
            if (!url) return '<p><em>[Image unavailable]</em></p>';
            return `<figure><img src="${escapeHtml(url)}" alt="${caption ? caption.replace(/<[^>]*>/g, '') : 'Image'}" />${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
        }

        case 'video': {
            const url = getMediaUrl(block, 'video');
            if (!url) return '<p><em>[Video unavailable]</em></p>';
            return `<div class="media-card"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">🎬 Video: ${escapeHtml(url)}</a></div>`;
        }

        case 'bookmark': {
            const url = data.url || '';
            const caption = data.caption ? renderRichText(data.caption) : '';
            return `<div class="media-card"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">🔗 ${caption || escapeHtml(url)}</a></div>`;
        }

        case 'embed': {
            const url = data.url || '';
            return `<div class="media-card"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">🌐 Embed: ${escapeHtml(url)}</a></div>`;
        }

        case 'file': {
            const url = getMediaUrl(block, 'file');
            const caption = data.caption ? renderRichText(data.caption) : '';
            if (!url) return '<p><em>[File unavailable]</em></p>';
            return `<div class="media-card"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">📎 ${caption || 'Download File'}</a></div>`;
        }

        case 'divider':
            return '<hr />';

        case 'table_of_contents':
            return '<p class="toc-placeholder"><em>[Table of Contents]</em></p>';

        case 'column_list':
            // Render all columns' children sequentially in a flex row for PDF
            return `<div class="column-list">${childrenHtml}</div>`;
        case 'column':
            return `<div class="column">${childrenHtml}</div>`;

        case 'child_page':
            return ''; // Handled separately via recursive tree

        case 'child_database':
            return `<div class="media-card">📊 <em>Database: ${escapeHtml(data.title || 'Untitled Database')}</em></div>`;

        case 'synced_block':
            // The content of synced blocks is in their children
            return childrenHtml;

        case 'table': {
            // Table rows are children
            if (children.length === 0) return '<p><em>[Empty table]</em></p>';
            const headerRow = children[0];
            const bodyRows = children.slice(1);
            const headerCells = ((headerRow as any).table_row?.cells || []) as RichTextItemResponse[][];
            const headerHtml = headerCells.map((cell: RichTextItemResponse[]) => `<th>${renderRichText(cell)}</th>`).join('');
            const bodyHtml = bodyRows.map((row: any) => {
                const cells = (row.table_row?.cells || []) as RichTextItemResponse[][];
                return `<tr>${cells.map((cell: RichTextItemResponse[]) => `<td>${renderRichText(cell)}</td>`).join('')}</tr>`;
            }).join('');
            return `<table class="notion-table"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
        }

        case 'table_row':
            return ''; // Handled by table block above

        default:
            return `<!-- Unsupported block type: ${type} -->`;
    }
}

// ─── Blocks → HTML (with list grouping & table handling) ────────────────────────

function blocksToHtml(blocks: BlockObjectResponse[]): string {
    const htmlParts: string[] = [];
    let i = 0;

    while (i < blocks.length) {
        const block = blocks[i];

        // Group consecutive bulleted list items
        if (block.type === 'bulleted_list_item') {
            const items: string[] = [];
            while (i < blocks.length && blocks[i].type === 'bulleted_list_item') {
                items.push(blockToHtml(blocks[i]));
                i++;
            }
            htmlParts.push(`<ul>${items.join('')}</ul>`);
            continue;
        }

        // Group consecutive numbered list items
        if (block.type === 'numbered_list_item') {
            const items: string[] = [];
            while (i < blocks.length && blocks[i].type === 'numbered_list_item') {
                items.push(blockToHtml(blocks[i]));
                i++;
            }
            htmlParts.push(`<ol>${items.join('')}</ol>`);
            continue;
        }

        htmlParts.push(blockToHtml(block));
        i++;
    }

    return htmlParts.join('\n');
}

// ─── Page Tree → Full HTML Document ─────────────────────────────────────────────

function pageTreeToHtml(tree: PageTree, isRoot = true): string {
    const parts: string[] = [];

    if (!isRoot) {
        parts.push('<div class="section-divider"></div>');
    }

    parts.push(`<div class="page-section">`);
    parts.push(`<h1 class="page-title">${escapeHtml(tree.title)}</h1>`);
    parts.push(blocksToHtml(tree.blocks));
    parts.push('</div>');

    for (const child of tree.children) {
        parts.push(pageTreeToHtml(child, false));
    }

    return parts.join('\n');
}

export function buildFullHtml(tree: PageTree): string {
    const bodyContent = pageTreeToHtml(tree, true);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(tree.title)}</title>
  <style>
    /* ─── Reset & Base ─────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #1a1a2e;
      background: #ffffff;
    }

    /* ─── Page Sections ────────────────────────────────────── */
    .page-section {
      padding: 0 0 0.8em 0;
    }

    .section-divider {
      border-top: 2px solid #e2e8f0;
      margin: 1.5em 0;
    }

    .page-title {
      font-size: 2em;
      font-weight: 700;
      color: #0f0f23;
      margin-bottom: 0.3em;
      padding-bottom: 0.2em;
      border-bottom: 3px solid #6366f1;
    }

    /* ─── Headings ─────────────────────────────────────────── */
    h1 { font-size: 1.8em; font-weight: 700; margin: 0.6em 0 0.25em; color: #0f0f23; }
    h2 { font-size: 1.45em; font-weight: 600; margin: 0.5em 0 0.2em; color: #1e1e3f; }
    h3 { font-size: 1.2em; font-weight: 600; margin: 0.4em 0 0.15em; color: #2d2d5e; }

    /* ─── Paragraph ────────────────────────────────────────── */
    p {
      margin: 0.3em 0;
    }

    /* ─── Links ────────────────────────────────────────────── */
    a {
      color: #6366f1;
      text-decoration: underline;
      text-decoration-color: rgba(99, 102, 241, 0.3);
      text-underline-offset: 2px;
    }

    /* ─── Lists ────────────────────────────────────────────── */
    ul, ol {
      margin: 0.3em 0 0.3em 1.5em;
      padding: 0;
    }

    li {
      margin: 0.25em 0;
    }

    /* ─── Inline Code ──────────────────────────────────────── */
    .inline-code {
      background: #f1f5f9;
      color: #e11d48;
      padding: 0.15em 0.4em;
      border-radius: 4px;
      font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 0.88em;
    }

    /* ─── Code Block ───────────────────────────────────────── */
    .code-block {
      margin: 0.6em 0;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #e2e8f0;
    }

    .code-header {
      background: #1e293b;
      color: #94a3b8;
      font-size: 0.75em;
      padding: 0.5em 1em;
      font-family: 'JetBrains Mono', monospace;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .code-block pre {
      background: #0f172a;
      color: #e2e8f0;
      padding: 1em;
      overflow-x: auto;
      font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 0.85em;
      line-height: 1.6;
      margin: 0;
    }

    /* ─── Blockquote ───────────────────────────────────────── */
    blockquote {
      border-left: 4px solid #6366f1;
      padding: 0.6em 1em;
      margin: 0.4em 0;
      background: #f8fafc;
      color: #334155;
      border-radius: 0 6px 6px 0;
    }

    /* ─── Callout ──────────────────────────────────────────── */
    .callout {
      display: flex;
      align-items: flex-start;
      gap: 0.75em;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 1em;
      margin: 0.4em 0;
    }

    .callout-icon {
      font-size: 1.3em;
      flex-shrink: 0;
      width: 1.5em;
      height: 1.5em;
    }

    .callout-content {
      flex: 1;
    }

    /* ─── Todo ─────────────────────────────────────────────── */
    .todo-item {
      display: flex;
      align-items: center;
      gap: 0.5em;
      margin: 0.3em 0;
    }

    .todo-item input[type="checkbox"] {
      width: 1em;
      height: 1em;
      accent-color: #6366f1;
    }

    .todo-done {
      text-decoration: line-through;
      color: #94a3b8;
    }

    /* ─── Toggle ───────────────────────────────────────────── */
    .toggle-block {
      margin: 0.5em 0;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 0.6em 1em;
    }

    .toggle-block summary {
      cursor: pointer;
      font-weight: 500;
    }

    .toggle-content {
      margin-top: 0.4em;
      padding-left: 0.5em;
    }

    /* ─── Nested Content ───────────────────────────────────── */
    .nested-content {
      margin-top: 0.2em;
      padding-left: 1em;
    }

    /* ─── Column Layout ────────────────────────────────────── */
    .column-list {
      display: flex;
      gap: 1em;
      margin: 0.4em 0;
    }

    .column {
      flex: 1;
      min-width: 0;
    }

    /* ─── Images ───────────────────────────────────────────── */
    figure {
      margin: 0.6em 0;
      text-align: center;
    }

    figure img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }

    figcaption {
      font-size: 0.85em;
      color: #64748b;
      margin-top: 0.5em;
      font-style: italic;
    }

    /* ─── Media Cards ──────────────────────────────────────── */
    .media-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 0.8em 1em;
      margin: 0.6em 0;
    }

    .media-card a {
      color: #6366f1;
      text-decoration: none;
      font-weight: 500;
    }

    /* ─── Tables ───────────────────────────────────────────── */
    .notion-table {
      width: 100%;
      border-collapse: collapse;
      margin: 1em 0;
      font-size: 0.9em;
    }

    .notion-table td, .notion-table th {
      border: 1px solid #e2e8f0;
      padding: 0.5em 0.75em;
      text-align: left;
    }

    .notion-table tr:first-child td {
      background: #f1f5f9;
      font-weight: 600;
    }

    /* ─── Divider ──────────────────────────────────────────── */
    hr {
      border: none;
      border-top: 2px solid #e2e8f0;
      margin: 0.8em 0;
    }

    /* ─── Notion Colors ────────────────────────────────────── */
    :root {
      --notion-gray: #787774;
      --notion-brown: #9f6b53;
      --notion-orange: #d9730d;
      --notion-yellow: #cb912f;
      --notion-green: #448361;
      --notion-blue: #337ea9;
      --notion-purple: #9065b0;
      --notion-pink: #c14c8a;
      --notion-red: #d44c47;
      --notion-gray_background: #f1f1ef;
      --notion-brown_background: #f4eeee;
      --notion-orange_background: #fbecdd;
      --notion-yellow_background: #fbf3db;
      --notion-green_background: #edf3ec;
      --notion-blue_background: #e7f3f8;
      --notion-purple_background: #f6f3f9;
      --notion-pink_background: #faf1f5;
      --notion-red_background: #fdebec;
    }

    /* ─── Image Placeholder ──────────────────────────────── */
    .img-placeholder {
      background: #f1f5f9;
      border: 1px dashed #cbd5e1;
      border-radius: 8px;
      padding: 1.5em;
      text-align: center;
      color: #94a3b8;
      font-size: 0.85em;
      font-style: italic;
      margin: 0.6em 0;
    }

    /* ─── Print ────────────────────────────────────────────── */
    @media print {
      body { background: white; }
    }
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`;
}

// ─── Image Base64 Embedding ─────────────────────────────────────────────────────

async function downloadImageAsBase64(url: string, retries = 2): Promise<string | null> {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);

            const response = await fetch(url, {
                signal: controller.signal,
                headers: { 'User-Agent': 'Notion-PDF-Generator/1.0' },
            });
            clearTimeout(timeout);

            if (!response.ok) {
                console.warn(`  [IMG] Failed to download (${response.status}, attempt ${attempt + 1}): ${url.slice(0, 80)}...`);
                if (attempt < retries) {
                    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
                    continue;
                }
                return null;
            }

            const contentType = response.headers.get('content-type') || 'image/png';
            const mime = contentType.split(';')[0].trim();
            const arrayBuffer = await response.arrayBuffer();
            const base64 = Buffer.from(arrayBuffer).toString('base64');

            return `data:${mime};base64,${base64}`;
        } catch (err: any) {
            console.warn(`  [IMG] Download error (attempt ${attempt + 1}): ${err.message} — ${url.slice(0, 80)}...`);
            if (attempt < retries) {
                await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
                continue;
            }
            return null;
        }
    }
    return null;
}

function unescapeHtml(str: string): string {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'");
}

async function embedImagesAsBase64(html: string): Promise<string> {
    // Find all <img> tags with http/https src attributes
    const imgRegex = /<img\s+([^>]*?)src="(https?:\/\/[^"]+)"([^>]*?)\/?>/gi;
    const matches: { escapedUrl: string; realUrl: string }[] = [];
    let match;

    while ((match = imgRegex.exec(html)) !== null) {
        const escapedUrl = match[2]; // URL as it appears in HTML (with &amp; etc.)
        const realUrl = unescapeHtml(escapedUrl); // Restore & for actual HTTP fetch
        matches.push({ escapedUrl, realUrl });
    }

    if (matches.length === 0) return html;

    console.log(`  [PDF] Downloading ${matches.length} image(s)...`);
    const t0 = Date.now();

    // Download all images concurrently
    const results = await Promise.allSettled(
        matches.map((m) => downloadImageAsBase64(m.realUrl))
    );

    let embedded = 0;
    let failed = 0;
    for (let i = 0; i < matches.length; i++) {
        const result = results[i];
        if (result.status === 'fulfilled' && result.value) {
            // Replace the escaped URL in the HTML with the base64 data URI
            html = html.replace(matches[i].escapedUrl, result.value);
            embedded++;
        } else {
            // Replace the broken <img> tag with a styled placeholder
            const imgRegex = new RegExp(
                `<img\\s+[^>]*src="${matches[i].escapedUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/?>`,
                'gi'
            );
            html = html.replace(imgRegex, '<div class="img-placeholder">📷 Image could not be loaded</div>');
            failed++;
        }
    }

    console.log(`  [PDF] Images embedded: ${embedded}/${matches.length}, failed: ${failed} (${Date.now() - t0}ms)`);
    return html;
}

// ─── PDF Generation ─────────────────────────────────────────────────────────────

export async function generatePdf(html: string): Promise<Buffer> {
    let browser;

    const isLocal = process.env.IS_LOCAL === 'true' || process.env.NODE_ENV === 'development';
    const t0 = Date.now();

    // Aggressive Chrome flags for fast PDF generation
    const fastArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--no-first-run',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--font-render-hinting=none',
    ];

    if (isLocal) {
        // Use puppeteer-core with system Chrome for reliable local PDF generation.
        // Full puppeteer's bundled chrome-headless-shell doesn't support page.pdf().
        const puppeteerCore = (await import('puppeteer-core')).default;

        // Try common Chrome paths on Windows, macOS, Linux
        const chromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/usr/bin/google-chrome',
            '/usr/bin/chromium-browser',
        ];

        let executablePath = process.env.CHROME_PATH || '';
        if (!executablePath) {
            const fs = await import('fs');
            for (const p of chromePaths) {
                if (fs.existsSync(p)) {
                    executablePath = p;
                    break;
                }
            }
        }

        if (!executablePath) {
            throw new Error(
                'Chrome not found. Install Google Chrome or set CHROME_PATH env variable.'
            );
        }

        console.log(`  [PDF] Using Chrome: ${executablePath}`);
        browser = await puppeteerCore.launch({
            headless: true,
            executablePath,
            args: fastArgs,
        });
    } else {
        const chromium = (await import('@sparticuz/chromium')).default;
        const puppeteerCore = (await import('puppeteer-core')).default;
        browser = await puppeteerCore.launch({
            args: [...chromium.args, ...fastArgs],
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });
    }

    console.log(`  [PDF] Browser launched (${Date.now() - t0}ms)`);

    // Pre-download all images and embed as base64 data URIs
    // This must happen before page.setContent since HTTP requests are blocked.
    html = await embedImagesAsBase64(html);

    try {
        const page = await browser.newPage();

        // Block ALL external HTTP requests — the HTML is self-contained with inline styles.
        // External images (Notion S3 URLs) are slow and cause multi-minute hangs.
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const url = req.url();
            // Allow internal navigation (about:blank, data:, chrome-internal:, etc.)
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                req.continue();
            } else {
                req.abort();
            }
        });

        await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });
        console.log(`  [PDF] Content set (${Date.now() - t0}ms)`);

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '15mm',
                bottom: '15mm',
                left: '15mm',
                right: '15mm',
            },
            timeout: 60000,
        });

        console.log(`  [PDF] PDF rendered (${Date.now() - t0}ms)`);
        return Buffer.from(pdfBuffer);
    } finally {
        await browser.close();
    }
}

// ─── Validate Page ID ───────────────────────────────────────────────────────────

export function isValidNotionId(id: string): boolean {
    return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)
        || /^[a-f0-9]{32}$/i.test(id);
}

export function formatId(id: string): string {
    if (id.includes('-')) return id;
    return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

// ─── Handler ────────────────────────────────────────────────────────────────────

export default async function handler(
    req: VercelRequest,
    res: VercelResponse
): Promise<void> {
    // Only allow POST
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed. Use POST.' });
        return;
    }

    // Authenticate user via JWT session cookie
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        res.status(500).json({ error: 'Server configuration error.' });
        return;
    }

    let accessToken: string;
    try {
        const cookies = parseCookie(req.headers.cookie || '');
        const sessionToken = cookies.session;
        if (!sessionToken) {
            res.status(401).json({ error: 'Not authenticated. Please connect with Notion first.' });
            return;
        }

        const payload = jwt.verify(sessionToken, jwtSecret) as { userId: number };
        const user = await getUserById(payload.userId);
        if (!user) {
            res.status(401).json({ error: 'User not found. Please reconnect with Notion.' });
            return;
        }
        accessToken = user.access_token;
    } catch {
        res.status(401).json({ error: 'Session expired. Please reconnect with Notion.' });
        return;
    }

    try {
        const { pageId } = req.body || {};

        if (!pageId || typeof pageId !== 'string') {
            res.status(400).json({ error: 'Missing or invalid "pageId" in request body.' });
            return;
        }

        if (!isValidNotionId(pageId)) {
            res.status(400).json({
                error: 'Invalid Notion page ID format. Expected a 32-character hex string or UUID.',
            });
            return;
        }

        const formattedId = formatId(pageId);
        const notion = getNotionClient(accessToken);

        // Phase 1: Recursively fetch all blocks
        const pageTree = await buildPageTree(notion, formattedId);

        if (pageTree.blocks.length === 0 && pageTree.children.length === 0) {
            res.status(404).json({
                error: 'The page appears to be empty or inaccessible. Make sure it is shared with your Notion integration.',
            });
            return;
        }

        // Phase 2: Convert to HTML
        const fullHtml = buildFullHtml(pageTree);

        // Phase 3: Generate PDF
        const pdfBuffer = await generatePdf(fullHtml);

        // Return the PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="notion-export.pdf"');
        res.setHeader('Content-Length', pdfBuffer.length.toString());
        res.status(200).send(pdfBuffer);
    } catch (err: any) {
        console.error('PDF generation error:', err);

        const status = err?.status || 500;
        const message =
            err?.code === 'object_not_found'
                ? 'Page not found. Ensure the page exists and is shared with your Notion integration.'
                : err?.code === 'unauthorized'
                    ? 'Your Notion access may have been revoked. Please reconnect with Notion.'
                    : err?.message || 'An unexpected error occurred during PDF generation.';

        res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
    }
}
