/**
 * Extracts a 32-character Notion page ID from various input formats:
 * - Raw 32-char hex: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4
 * - Dashed UUID:     a1b2c3d4-e5f6-a1b2-c3d4-e5f6a1b2c3d4
 * - Full URL:        https://www.notion.so/workspace/Page-Title-a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4
 * - Short URL:       https://notion.so/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4
 * - With query:      https://notion.so/workspace/Page-a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4?v=xxx
 */
export function extractNotionId(input: string): string | null {
    const trimmed = input.trim();

    if (!trimmed) return null;

    // Try matching a dashed UUID (8-4-4-4-12)
    const dashedMatch = trimmed.match(
        /\b([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\b/i
    );
    if (dashedMatch) {
        return dashedMatch[1].replace(/-/g, '');
    }

    // Try matching a 32-char hex string (possibly at the end of a URL path segment)
    const hexMatch = trimmed.match(/\b([a-f0-9]{32})\b/i);
    if (hexMatch) {
        return hexMatch[1];
    }

    // Try extracting from a Notion URL where the ID is the last 32 hex chars of a slug
    // e.g., "Page-Title-a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
    const urlSlugMatch = trimmed.match(/([a-f0-9]{32})(?:\?.*)?$/i);
    if (urlSlugMatch) {
        return urlSlugMatch[1];
    }

    return null;
}

/**
 * Formats a 32-char hex ID into a dashed UUID format for the Notion API.
 */
export function formatNotionId(id: string): string {
    if (id.includes('-')) return id;
    return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}
