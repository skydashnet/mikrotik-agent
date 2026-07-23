export interface SseFrame<T = unknown> {
	event: string;
	data: T;
}

/** Parse one complete SSE frame, including CRLF and multi-line data payloads. */
export function parseSseFrame<T = unknown>(rawFrame: string): SseFrame<T> | null {
	let event = 'message';
	const dataLines: string[] = [];
	for (const line of rawFrame.replace(/\r\n/g, '\n').split('\n')) {
		if (!line || line.startsWith(':')) continue;
		if (line.startsWith('event:')) event = line.slice(6).trim();
		else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
	}
	if (!dataLines.length) return null;
	try {
		return { event, data: JSON.parse(dataLines.join('\n')) as T };
	} catch {
		return null;
	}
}
