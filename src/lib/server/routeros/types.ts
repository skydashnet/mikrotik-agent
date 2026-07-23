// RouterOS transport abstraction.
// One interface, two implementations:
//   - RestClient: RouterOS v7 REST API (HTTP/HTTPS, /rest/...)
//   - ApiClient:  RouterOS v6 binary API (TCP 8728 / TLS 8729)
//
// A "command" maps to a RouterOS menu path + action, e.g.
//   { path: '/ip/address', action: 'print' }
//   { path: '/ip/firewall/filter', action: 'add', params: { chain: 'forward', action: 'drop' } }

export type RouterOsAction = 'print' | 'add' | 'set' | 'remove' | 'monitor';

export interface RouterOsCommand {
	/** Menu path, always leading-slash form: '/ip/address' */
	path: string;
	action: RouterOsAction;
	/** Attribute key/values (RouterOS "=key=value" words for API, JSON body for REST) */
	params?: Record<string, string | number | boolean>;
	/** Query filters for print (REST: query params; API: ?key=value words) */
	query?: Record<string, string | number | boolean>;
	/** Specific item id (.id) for set/remove */
	id?: string;
}

export type RouterOsRow = Record<string, string>;

export interface RouterOsClient {
	/** Whether the underlying connection is usable (REST is always true). */
	readonly isAlive: boolean;
	/** Verify credentials + reachability. Returns detected RouterOS version if available. */
	testConnection(): Promise<{ ok: boolean; version?: string }>;
	/** Execute a command. `print` returns rows; mutations return affected rows (may be empty). */
	execute(cmd: RouterOsCommand): Promise<RouterOsRow[]>;
	/** Release any held resources (sockets). */
	close(): Promise<void>;
}

export interface RouterConnectionConfig {
	host: string;
	port?: number;
	useTls: boolean;
	username: string;
	password: string;
}

/** Only allow normalized RouterOS menu paths; rejects traversal and URL fragments. */
export function isRouterOsPath(path: string): boolean {
	return /^\/[a-z0-9][a-z0-9_./-]*$/i.test(path) && !path.includes('..');
}
