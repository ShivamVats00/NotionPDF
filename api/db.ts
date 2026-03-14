import { neon, neonConfig } from '@neondatabase/serverless';

// Optionally configure Neon to use WebSockets in serverless environments
neonConfig.fetchConnectionCache = true;

/**
 * Ensures a valid database connection string exists and returns a Neon SQL client.
 */
function getDb() {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is not configured');
    }
    return neon(process.env.DATABASE_URL);
}

export interface UserData {
    notionWorkspaceId: string;
    workspaceName: string;
    accessToken: string;
    botId?: string;
}

/**
 * Inserts a new user or updates an existing user based on their Notion workspace ID.
 */
export async function upsertUser(data: UserData) {
    const sql = getDb();
    const result = await sql`
        INSERT INTO users (notion_workspace_id, workspace_name, access_token, bot_id)
        VALUES (${data.notionWorkspaceId}, ${data.workspaceName}, ${data.accessToken}, ${data.botId || null})
        ON CONFLICT (notion_workspace_id) DO UPDATE SET
            workspace_name = EXCLUDED.workspace_name,
            access_token = EXCLUDED.access_token,
            bot_id = EXCLUDED.bot_id,
            updated_at = NOW()
        RETURNING id, notion_workspace_id, workspace_name;
    `;
    return result[0];
}

/**
 * Retrieves user information by their internal database ID.
 */
export async function getUserById(id: number) {
    const sql = getDb();
    const result = await sql`
        SELECT * FROM users WHERE id = ${id}
    `;
    return result.length > 0 ? result[0] : null;
}
