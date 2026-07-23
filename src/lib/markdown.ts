export type MarkdownBlock =
	| { type: 'heading'; level: number; text: string }
	| { type: 'paragraph'; text: string }
	| { type: 'code'; language: string; code: string }
	| { type: 'list'; ordered: boolean; start: number; items: string[] }
	| { type: 'quote'; text: string }
	| { type: 'table'; headers: string[]; rows: string[][] }
	| { type: 'rule' };

function isSpecial(line: string, next = ''): boolean {
	return /^\s*```/.test(line) || /^#{1,6}\s+/.test(line) || /^\s*([-*+]\s+|\d+\.\s+|>\s?)/.test(line) || /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line) || isTableStart(line, next);
}

function splitTableRow(line: string): string[] {
	return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}

function isTableStart(line: string, next: string): boolean {
	if (!line.includes('|')) return false;
	const separators = splitTableRow(next);
	return separators.length > 0 && separators.every((cell) => /^:?-{3,}:?$/.test(cell));
}

export function parseMarkdown(source: string): MarkdownBlock[] {
	const lines = source.replace(/\r\n?/g, '\n').split('\n');
	const blocks: MarkdownBlock[] = [];
	let index = 0;
	let nextOrderedListNumber: number | null = null;

	while (index < lines.length) {
		const line = lines[index];
		if (!line.trim()) { index++; continue; }

		const fence = line.match(/^\s*```\s*([\w.+-]*)\s*$/);
		if (fence) {
			const code: string[] = [];
			index++;
			while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) code.push(lines[index++]);
			if (index < lines.length) index++;
			blocks.push({ type: 'code', language: fence[1] || 'teks', code: code.join('\n') });
			continue;
		}

		const heading = line.match(/^(#{1,6})\s+(.+)$/);
		if (heading) {
			nextOrderedListNumber = null;
			blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
			index++;
			continue;
		}

		if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
			nextOrderedListNumber = null;
			blocks.push({ type: 'rule' }); index++; continue;
		}

		if (isTableStart(line, lines[index + 1] ?? '')) {
			nextOrderedListNumber = null;
			const headers = splitTableRow(line);
			index += 2;
			const rows: string[][] = [];
			while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
				const cells = splitTableRow(lines[index++]);
				rows.push(headers.map((_, cellIndex) => cells[cellIndex] ?? ''));
			}
			blocks.push({ type: 'table', headers, rows });
			continue;
		}

		const listMatch = line.match(/^\s*([-*+]|\d+\.)\s+(.+)$/);
		if (listMatch) {
			const ordered = /\d+\./.test(listMatch[1]);
			const markerNumber = ordered ? Number.parseInt(listMatch[1], 10) : 1;
			const start: number = ordered && markerNumber === 1 && nextOrderedListNumber !== null
				? nextOrderedListNumber
				: markerNumber;
			const items: string[] = [];
			while (index < lines.length) {
				const item = lines[index].match(ordered ? /^\s*\d+\.\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/);
				if (!item) break;
				items.push(item[1].trim());
				index++;
			}
			blocks.push({ type: 'list', ordered, start, items });
			nextOrderedListNumber = ordered ? start + items.length : null;
			continue;
		}

		if (/^\s*>/.test(line)) {
			nextOrderedListNumber = null;
			const quote: string[] = [];
			while (index < lines.length && /^\s*>/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ''));
			blocks.push({ type: 'quote', text: quote.join(' ') });
			continue;
		}

		const paragraph = [line.trim()];
		index++;
		while (index < lines.length && lines[index].trim() && !isSpecial(lines[index], lines[index + 1] ?? '')) {
			paragraph.push(lines[index++].trim());
		}
		blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
		nextOrderedListNumber = null;
	}

	return blocks;
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

function safeHref(value: string): string | null {
	try {
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
	} catch {
		return null;
	}
}

export function renderInline(source: string): string {
	const tokens: string[] = [];
	let value = source.replace(/`([^`]+)`/g, (_match, code: string) => {
		const token = `\u0000${tokens.length}\u0000`;
		tokens.push(`<code>${escapeHtml(code)}</code>`);
		return token;
	});

	value = value.replace(/\[([^\]]+)\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g, (_match, label: string, href: string) => {
		const token = `\u0000${tokens.length}\u0000`;
		const safe = safeHref(href);
		tokens.push(safe ? `<a href="${escapeHtml(safe)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>` : escapeHtml(label));
		return token;
	});

	value = escapeHtml(value)
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/__([^_]+)__/g, '<strong>$1</strong>')
		.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
		.replace(/~~([^~]+)~~/g, '<del>$1</del>');

	return value.replace(/\u0000(\d+)\u0000/g, (_match, tokenIndex: string) => tokens[Number(tokenIndex)] ?? '');
}
