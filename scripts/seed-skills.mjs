/**
 * Seed RouterOS skill docs (tikoci/routeros-skills) into skill_docs with local embeddings.
 * Usage: node scripts/seed-skills.mjs   (reads .env; needs network to fetch skills + model on first run)
 *
 * Fetches SKILL.md + reference markdown from the tikoci repo, chunks them,
 * embeds each chunk with MiniLM (local), and upserts into PostgreSQL.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import { pipeline } from '@huggingface/transformers';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
	try {
		const txt = readFileSync(join(__dirname, '..', '.env'), 'utf8');
		for (const line of txt.split('\n')) {
			const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
			if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
		}
	} catch {
		/* optional */
	}
}
loadEnv();

const REPO = 'tikoci/routeros-skills';
const BRANCH = 'main';
const RAW = (p) => `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${p}`;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function fetchWithRetry(url, options, attempts = 5) {
	let lastError;
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			return await fetch(url, { ...options, signal: AbortSignal.timeout(30_000) });
		} catch (error) {
			lastError = error;
			if (attempt < attempts) {
				console.warn(`  fetch retry ${attempt}/${attempts - 1}: ${new URL(url).hostname}`);
				await wait(1000 * 2 ** (attempt - 1));
			}
		}
	}
	throw lastError;
}

// Split markdown into ~1000-char chunks on paragraph boundaries.
function chunk(text, size = 1000) {
	const paras = text.split(/\n{2,}/);
	const chunks = [];
	let cur = '';
	for (const p of paras) {
		if ((cur + '\n\n' + p).length > size && cur) {
			chunks.push(cur.trim());
			cur = p;
		} else {
			cur = cur ? cur + '\n\n' + p : p;
		}
	}
	if (cur.trim()) chunks.push(cur.trim());
	return chunks.filter((c) => c.length > 40);
}

async function listMarkdownPaths() {
	const res = await fetchWithRetry(
		`https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`,
		{ headers: { 'User-Agent': 'mtk-manager-seed' } }
	);
	if (!res.ok) throw new Error(`GitHub tree fetch failed: ${res.status}`);
	const json = await res.json();
	return json.tree
		.filter((n) => n.type === 'blob' && n.path.endsWith('.md') && !n.path.startsWith('.github'))
		.map((n) => n.path);
}

const {
	DB_HOST = '127.0.0.1',
	DB_PORT = '5432',
	DB_USER = 'postgres',
	DB_PASSWORD = '',
	DB_NAME = 'mikrotik_manager'
} = process.env;

console.log('Loading embedding model (first run downloads ~90MB)...');
const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
async function embed(text) {
	const out = await extractor(text, { pooling: 'mean', normalize: true });
	return Array.from(out.data);
}

const conn = new pg.Client({
	host: DB_HOST,
	port: Number(DB_PORT),
	user: DB_USER,
	password: DB_PASSWORD || undefined,
	database: DB_NAME
});
await conn.connect();

console.log('Fetching skill list from GitHub...');
const paths = await listMarkdownPaths();
console.log(`Found ${paths.length} markdown files.`);

// Download first so a transient network failure cannot wipe a previously healthy index.
console.log('Downloading skill documents...');
const documents = [];
for (const path of paths) {
	try {
		const res = await fetchWithRetry(RAW(path), { headers: { 'User-Agent': 'mtk-manager-seed' } });
		if (!res.ok) {
			console.warn(`  skip ${path} (${res.status})`);
			continue;
		}
		documents.push({ path, markdown: await res.text() });
	} catch (error) {
		console.warn(`  skip ${path} (${error.message})`);
	}
}
if (documents.length < Math.ceil(paths.length * 0.8)) {
	throw new Error(`Hanya ${documents.length}/${paths.length} dokumen yang terunduh; data lama dipertahankan.`);
}
console.log(`Downloaded ${documents.length}/${paths.length} markdown files.`);

let total = 0;

await conn.query('BEGIN');
try {
	await conn.query('DELETE FROM skill_docs');
	for (const { path, markdown } of documents) {
		const title = (markdown.match(/^#\s+(.+)$/m)?.[1] ?? path).slice(0, 300);
		const chunks = chunk(markdown);
		for (const c of chunks) {
			const vec = await embed(c);
			await conn.query(
				'INSERT INTO skill_docs (source, title, content, embedding) VALUES ($1, $2, $3, $4)',
				[path, title, c, JSON.stringify(vec)]
			);
			total++;
		}
		console.log(`  ${path}: ${chunks.length} chunks`);
	}
	await conn.query('COMMIT');
} catch (error) {
	await conn.query('ROLLBACK');
	throw error;
}

console.log(`✓ Seeded ${total} skill chunks.`);
await conn.end();
