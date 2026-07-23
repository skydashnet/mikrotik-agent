import type { ToolDef } from './client.js';
import { runCommand } from '../routeros/connection-manager.js';
import { searchDocs } from '../rag/search.js';
import { isRouterOsPath } from '../routeros/types.js';

// Chat-scoped router context. null routerId => chat not bound to a router.
export interface ToolContext {
	userId: number;
	routerId: number | null;
}

// Read-only RouterOS tools exposed to the AI.
// SAFETY: only 'print'/read paths. No add/set/remove; the model cannot mutate the router.

export const tools: ToolDef[] = [
	{
		type: 'function',
		function: {
			name: 'ros_print',
			description:
				'Read MikroTik router configuration or status from a menu path. Read-only. ' +
				'Example paths: /ip/address, /ip/route, /interface, /ip/firewall/filter, /system/resource, /ip/dhcp-server/lease.',
			parameters: {
				type: 'object',
				properties: {
					path: {
						type: 'string',
						description: 'RouterOS menu path beginning with a slash, for example /ip/address'
					},
					query: {
						type: 'object',
						description: 'Optional filter, for example {"interface":"ether1"}',
						additionalProperties: { type: 'string' }
					}
				},
				required: ['path']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'search_docs',
			description:
				'Search RouterOS documentation or the knowledge base for guidance, command syntax, ' +
				'and configuration examples. Use it before answering configuration questions.',
			parameters: {
				type: 'object',
				properties: {
					query: { type: 'string', description: 'Natural-language search query' },
					limit: { type: 'number', description: 'Maximum number of results, default 4' }
				},
				required: ['query']
			}
		}
	}
];

// Execute a tool call. Router access goes through the connection manager
// (pooled + serialized) so we don't spam RouterOS login/logout logs.
export async function runTool(
	name: string,
	args: Record<string, unknown>,
	ctx: ToolContext
): Promise<string> {
	switch (name) {
		case 'ros_print': {
			if (ctx.routerId === null) return JSON.stringify({ error: 'Belum ada router yang dipilih untuk percakapan ini.' });
			const path = String(args.path ?? '');
			if (!isRouterOsPath(path)) {
				return JSON.stringify({ error: 'Path RouterOS hanya-baca tidak valid.' });
			}
			const rawQuery = args.query;
			const query = rawQuery && typeof rawQuery === 'object' && !Array.isArray(rawQuery)
				? Object.fromEntries(Object.entries(rawQuery).slice(0, 20).map(([key, value]) => [key, String(value).slice(0, 500)]))
				: undefined;
			try {
				const rows = await runCommand(ctx.userId, ctx.routerId, { path, action: 'print', query });
				// Cap payload to keep token usage sane.
				return JSON.stringify(rows.slice(0, 100));
			} catch (e) {
				return JSON.stringify({ error: (e as Error).message });
			}
		}
		case 'search_docs': {
			const query = String(args.query ?? '');
			const limit = Math.min(8, Math.max(1, Number(args.limit) || 4));
			try {
				const results = await searchDocs(query, limit);
				return JSON.stringify(results);
			} catch (e) {
				return JSON.stringify({ error: (e as Error).message });
			}
		}
		default:
			return JSON.stringify({ error: `Tool tidak dikenal: ${name}` });
	}
}
