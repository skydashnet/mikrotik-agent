import type { RouterConnectionConfig, RouterOsClient } from './types.js';
import { RestClient } from './rest.js';
import { ApiClient } from './api.js';

export type Transport = 'rest' | 'api';

export function createRouterClient(
	transport: Transport,
	cfg: RouterConnectionConfig
): RouterOsClient {
	if (transport === 'rest') return new RestClient(cfg);
	return new ApiClient(cfg);
}

export { type RouterOsClient, type RouterOsCommand, type RouterOsRow, type RouterConnectionConfig } from './types.js';
