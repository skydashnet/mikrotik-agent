import { query, queryOne, execute, insertReturningId, getPool } from './db.js';
import type { ChatMessage } from './ai/client.js';

export interface ChatSession {
	id: number;
	user_id: number;
	router_id: number | null;
	title: string | null;
	memory_summary: string | null;
	memory_through_message_id: number | null;
	created_at: Date;
}

export async function listSessions(userId: number): Promise<ChatSession[]> {
	return query<ChatSession>(
		'SELECT id, user_id, router_id, title, memory_summary, memory_through_message_id, created_at FROM chat_sessions WHERE user_id = ? ORDER BY created_at DESC',
		[userId]
	);
}

export async function getSession(userId: number, id: number): Promise<ChatSession | null> {
	return queryOne<ChatSession>(
		'SELECT id, user_id, router_id, title, memory_summary, memory_through_message_id, created_at FROM chat_sessions WHERE id = ? AND user_id = ?',
		[id, userId]
	);
}

export async function createSession(
	userId: number,
	routerId: number | null,
	title: string | null
): Promise<number> {
	return insertReturningId(
		'INSERT INTO chat_sessions (user_id, router_id, title) VALUES (?, ?, ?) RETURNING id',
		[userId, routerId, title]
	);
}

interface MsgRow {
	id: number;
	role: ChatMessage['role'];
	content: string;
	tool_calls: unknown; // JSONB: object|null (or string if ever stored as text)
	tool_call_id: string | null;
	name: string | null;
}

export interface StoredChatMessage extends ChatMessage {
	id: number;
}

export async function getStoredMessages(sessionId: number): Promise<StoredChatMessage[]> {
	const rows = await query<MsgRow>(
		'SELECT id, role, content, tool_calls, tool_call_id, name FROM chat_messages WHERE session_id = ? ORDER BY id',
		[sessionId]
	);
	return rows.map((r) => ({
		id: r.id,
		role: r.role,
		content: r.content || null,
		tool_calls: r.tool_calls
			? typeof r.tool_calls === 'string' ? JSON.parse(r.tool_calls) : r.tool_calls
			: undefined,
		tool_call_id: r.tool_call_id ?? undefined,
		name: r.name ?? undefined
	}));
}

// Load persisted history as OpenAI-shaped messages (for replay to the model).
export async function getMessages(sessionId: number): Promise<ChatMessage[]> {
	return (await getStoredMessages(sessionId)).map(({ id: _id, ...message }) => message);
}

export async function addMessage(sessionId: number, msg: ChatMessage): Promise<number> {
	if (typeof msg.content !== 'string' && msg.content !== null) {
		throw new Error('Konten multimodal harus disimpan sebagai pesan teks dan attachment terpisah.');
	}
	return insertReturningId(
		'INSERT INTO chat_messages (session_id, role, content, tool_calls, tool_call_id, name) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
		[
			sessionId,
			msg.role,
			msg.content ?? '',
			msg.tool_calls ? JSON.stringify(msg.tool_calls) : null,
			msg.tool_call_id ?? null,
			msg.name ?? null
		]
	);
}

export async function updateChatMemory(sessionId: number, summary: string, throughMessageId: number): Promise<void> {
	await execute(
		'UPDATE chat_sessions SET memory_summary = ?, memory_through_message_id = ? WHERE id = ?',
		[summary, throughMessageId, sessionId]
	);
}

export interface UndoneChatTurn {
	message: string;
	storagePaths: string[];
	sessionDeleted: boolean;
}

// Delete one complete turn beginning at a user message. When userMessageId is
// omitted, the latest user turn is selected. Session ownership and the delete
// run in one transaction so another user's history can never be targeted.
export async function undoChatTurn(
	userId: number,
	sessionId: number,
	userMessageId?: number
): Promise<UndoneChatTurn | null> {
	const client = await getPool().connect();
	try {
		await client.query('BEGIN');
		const session = await client.query(
			'SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE',
			[sessionId, userId]
		);
		if (!session.rowCount) {
			await client.query('ROLLBACK');
			return null;
		}

		const target = userMessageId === undefined
			? await client.query(
				'SELECT id, content FROM chat_messages WHERE session_id = $1 AND role = $2 ORDER BY id DESC LIMIT 1',
				[sessionId, 'user']
			)
			: await client.query(
				'SELECT id, content FROM chat_messages WHERE id = $1 AND session_id = $2 AND role = $3',
				[userMessageId, sessionId, 'user']
			);
		if (!target.rowCount) {
			await client.query('ROLLBACK');
			return null;
		}

		const targetId = Number(target.rows[0].id);
		const attachments = await client.query(
			`SELECT a.storage_path
			 FROM chat_message_attachments a
			 JOIN chat_messages m ON m.id = a.message_id
			 WHERE m.session_id = $1 AND m.id >= $2`,
			[sessionId, targetId]
		);
		await client.query('DELETE FROM chat_messages WHERE session_id = $1 AND id >= $2', [sessionId, targetId]);
		const remaining = await client.query('SELECT 1 FROM chat_messages WHERE session_id = $1 LIMIT 1', [sessionId]);
		const sessionDeleted = !remaining.rowCount;
		if (sessionDeleted) {
			await client.query('DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2', [sessionId, userId]);
		} else {
			// The memory may already contain facts from the removed turn. Rebuild it
			// from retained messages on a future request instead of leaking stale context.
			await client.query(
				'UPDATE chat_sessions SET memory_summary = NULL, memory_through_message_id = NULL WHERE id = $1',
				[sessionId]
			);
		}
		await client.query('COMMIT');
		return {
			message: String(target.rows[0].content || ''),
			storagePaths: attachments.rows.map((row) => String(row.storage_path)),
			sessionDeleted
		};
	} catch (error) {
		await client.query('ROLLBACK').catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
}

export async function deleteChatSession(userId: number, sessionId: number): Promise<string[] | null> {
	const client = await getPool().connect();
	try {
		await client.query('BEGIN');
		const session = await client.query(
			'SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE',
			[sessionId, userId]
		);
		if (!session.rowCount) {
			await client.query('ROLLBACK');
			return null;
		}
		const attachments = await client.query(
			`SELECT a.storage_path
			 FROM chat_message_attachments a
			 JOIN chat_messages m ON m.id = a.message_id
			 WHERE m.session_id = $1`,
			[sessionId]
		);
		await client.query('DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2', [sessionId, userId]);
		await client.query('COMMIT');
		return attachments.rows.map((row) => String(row.storage_path));
	} catch (error) {
		await client.query('ROLLBACK').catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
}

export interface ChatAttachment {
	id: number;
	message_id: number;
	filename: string;
	mime_type: string;
	size_bytes: number;
	storage_path: string;
}

export async function addAttachment(
	messageId: number,
	attachment: Omit<ChatAttachment, 'id' | 'message_id'>
): Promise<number> {
	return insertReturningId(
		'INSERT INTO chat_message_attachments (message_id, filename, mime_type, size_bytes, storage_path) VALUES (?, ?, ?, ?, ?) RETURNING id',
		[messageId, attachment.filename, attachment.mime_type, attachment.size_bytes, attachment.storage_path]
	);
}

export async function getAttachment(userId: number, attachmentId: number): Promise<ChatAttachment | null> {
	return queryOne<ChatAttachment>(
		`SELECT a.id, a.message_id, a.filename, a.mime_type, a.size_bytes, a.storage_path
		 FROM chat_message_attachments a
		 JOIN chat_messages m ON m.id = a.message_id
		 JOIN chat_sessions s ON s.id = m.session_id
		 WHERE a.id = ? AND s.user_id = ?`,
		[attachmentId, userId]
	);
}

interface DisplayMessageRow {
	id: number;
	role: ChatMessage['role'];
	content: string;
	attachments: Array<{ id: number; filename: string; mime_type: string }> | null;
}

export async function getDisplayMessages(sessionId: number): Promise<DisplayMessageRow[]> {
	return query<DisplayMessageRow>(
		`SELECT m.id, m.role, m.content,
		 COALESCE(json_agg(json_build_object('id', a.id, 'filename', a.filename, 'mime_type', a.mime_type)
		 ORDER BY a.id) FILTER (WHERE a.id IS NOT NULL), '[]'::json) AS attachments
		 FROM chat_messages m
		 LEFT JOIN chat_message_attachments a ON a.message_id = m.id
		 WHERE m.session_id = ?
		 GROUP BY m.id
		 ORDER BY m.id`,
		[sessionId]
	);
}
