import { queryOne, execute } from './db.js';
import { encrypt, decrypt } from './crypto.js';

export interface AiSettings {
	baseUrl: string;
	apiKey: string;
	activeModel: string | null;
}

export async function getAiSettings(userId: number): Promise<AiSettings | null> {
	const row = await queryOne<{ base_url: string; api_key_enc: string; active_model: string | null }>(
		'SELECT base_url, api_key_enc, active_model FROM ai_settings WHERE user_id = ?',
		[userId]
	);
	if (!row) return null;
	return { baseUrl: row.base_url, apiKey: decrypt(row.api_key_enc), activeModel: row.active_model };
}

export async function saveAiSettings(
	userId: number,
	baseUrl: string,
	apiKey: string,
	activeModel: string | null
): Promise<void> {
	await execute(
		`INSERT INTO ai_settings (user_id, base_url, api_key_enc, active_model)
		 VALUES (?, ?, ?, ?)
		 ON CONFLICT (user_id) DO UPDATE SET
		   base_url = EXCLUDED.base_url,
		   api_key_enc = EXCLUDED.api_key_enc,
		   active_model = EXCLUDED.active_model,
		   updated_at = now()`,
		[userId, baseUrl, encrypt(apiKey), activeModel]
	);
}

export async function setActiveModel(userId: number, model: string): Promise<void> {
	await execute('UPDATE ai_settings SET active_model = ? WHERE user_id = ?', [model, userId]);
}
