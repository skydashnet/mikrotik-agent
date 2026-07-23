import { query } from '../db.js';
import { embed, cosine } from './embed.js';

export interface DocResult {
	id: number;
	source: string;
	title: string | null;
	content: string;
	score: number;
}

interface DocRow {
	id: number;
	source: string;
	title: string | null;
	content: string;
	embedding: unknown; // JSONB -> number[] (pg parses); string only if legacy text
}

// Vector search over skill_docs. Embeddings are stored as JSON; we compute
// cosine similarity app-side (works on PostgreSQL without vector extensions).
// ponytail: linear scan over all docs. Fine for a curated skill set (hundreds/low-thousands).
// Upgrade path: switch to a vector index (pgvector/Qdrant) when the corpus grows.
export async function searchDocs(queryText: string, limit = 4): Promise<DocResult[]> {
	const qVec = await embed(queryText);
	const rows = await query<DocRow>('SELECT id, source, title, content, embedding FROM skill_docs');
	const scored = rows.map((r) => {
		const vec = typeof r.embedding === 'string' ? JSON.parse(r.embedding) : r.embedding;
		return {
			id: r.id,
			source: r.source,
			title: r.title,
			// Truncate content to keep tool output compact.
			content: r.content.slice(0, 1200),
			score: cosine(qVec, vec as number[])
		};
	});
	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, limit);
}
