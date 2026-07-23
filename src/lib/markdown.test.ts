import { describe, expect, it } from 'vitest';
import { parseMarkdown, renderInline } from './markdown.js';

describe('renderer Markdown respons AI', () => {
	it('memformat heading, daftar, tabel, dan code fence', () => {
		const blocks = parseMarkdown('## Audit\n\n- Aman\n- Perlu dicek\n\n| Interface | Status |\n| --- | --- |\n| ether1 | up |\n\n```routeros\n/interface print\n```');
		expect(blocks.map((block) => block.type)).toEqual(['heading', 'list', 'table', 'code']);
	});

	it('meng-escape HTML mentah dan menolak tautan javascript', () => {
		const result = renderInline('<img src=x> **aman** [jahat](javascript:alert(1))');
		expect(result).toContain('&lt;img src=x&gt;');
		expect(result).toContain('<strong>aman</strong>');
		expect(result).not.toContain('href=');
		expect(result).not.toContain('<img');
	});

	it('melanjutkan nomor daftar yang dipisahkan code fence atau baris kosong', () => {
		const blocks = parseMarkdown(`Temuan:\n\n1. Error RX. Cek:\n\n\`\`\`routeros\n/interface ethernet monitor ether2 once\n\`\`\`\n\n1. Queue drop. Cek:\n\n\`\`\`routeros\n/interface monitor-traffic ether2\n\`\`\`\n\n1. Interface manajemen down.\n\n1. Interface backup idle.`);
		const lists = blocks.filter((block) => block.type === 'list');

		expect(lists.map((block) => block.start)).toEqual([1, 2, 3, 4]);
	});

	it('memulai ulang nomor setelah paragraf biasa', () => {
		const blocks = parseMarkdown('1. Daftar pertama\n\nPenutup daftar.\n\n1. Daftar baru');
		const lists = blocks.filter((block) => block.type === 'list');

		expect(lists.map((block) => block.start)).toEqual([1, 1]);
	});
});
