/**
 * DB init for PostgreSQL: creates the database (if missing) and applies schema.sql.
 * Usage: node scripts/init-db.mjs   (reads .env)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Minimal .env loader (avoid extra dep).
function loadEnv() {
	try {
		const txt = readFileSync(join(__dirname, '..', '.env'), 'utf8');
		for (const line of txt.split('\n')) {
			const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
			if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
		}
	} catch {
		/* .env optional */
	}
}
loadEnv();

const {
	DB_HOST = '127.0.0.1',
	DB_PORT = '5432',
	DB_USER = 'postgres',
	DB_PASSWORD = '',
	DB_NAME = 'mikrotik_manager'
} = process.env;

const conn = { host: DB_HOST, port: Number(DB_PORT), user: DB_USER, password: DB_PASSWORD || undefined };

// 1) Create database if missing (connect to default 'postgres' db first).
const admin = new pg.Client({ ...conn, database: 'postgres' });
await admin.connect();
const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
if (exists.rowCount === 0) {
	await admin.query(`CREATE DATABASE "${DB_NAME}"`);
	console.log(`✓ Created database "${DB_NAME}".`);
}
await admin.end();

// 2) Apply schema.
const schema = readFileSync(join(__dirname, '..', 'src', 'lib', 'server', 'schema.sql'), 'utf8');
const db = new pg.Client({ ...conn, database: DB_NAME });
await db.connect();
await db.query(schema); // pg supports multiple statements in a simple query
console.log(`✓ Schema applied to "${DB_NAME}".`);
await db.end();
