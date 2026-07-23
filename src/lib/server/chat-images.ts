import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { addAttachment } from './chat.js';

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_IMAGES = 4;

export interface IncomingImage {
	name: string;
	type: (typeof ALLOWED_IMAGE_TYPES)[number];
	data: string;
}

const extensions: Record<IncomingImage['type'], string> = {
	'image/jpeg': '.jpg',
	'image/png': '.png',
	'image/webp': '.webp',
	'image/gif': '.gif'
};

function hasValidSignature(type: IncomingImage['type'], bytes: Buffer): boolean {
	if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
	if (type === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
	if (type === 'image/gif') return bytes.subarray(0, 6).toString('ascii') === 'GIF87a' || bytes.subarray(0, 6).toString('ascii') === 'GIF89a';
	return bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
}

export function decodeAndValidateImages(images: IncomingImage[]): Array<IncomingImage & { bytes: Buffer }> {
	let total = 0;
	return images.map((image) => {
		const bytes = Buffer.from(image.data, 'base64');
		if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error(`Ukuran ${image.name} harus di bawah 5 MB.`);
		if (!hasValidSignature(image.type, bytes)) throw new Error(`Isi file ${image.name} tidak cocok dengan format gambarnya.`);
		total += bytes.length;
		if (total > MAX_TOTAL_IMAGE_BYTES) throw new Error('Total ukuran gambar harus di bawah 12 MB.');
		return { ...image, bytes };
	});
}

export async function saveChatImages(userId: number, messageId: number, images: ReturnType<typeof decodeAndValidateImages>): Promise<void> {
	const relativeDir = String(userId);
	const directory = resolve('data', 'chat-uploads', relativeDir);
	await mkdir(directory, { recursive: true, mode: 0o700 });
	for (const image of images) {
		const storedName = `${randomUUID()}${extensions[image.type] || extname(image.name)}`;
		const absolutePath = resolve(directory, storedName);
		await writeFile(absolutePath, image.bytes, { mode: 0o600 });
		try {
			await addAttachment(messageId, {
				filename: image.name.slice(0, 200),
				mime_type: image.type,
				size_bytes: image.bytes.length,
				storage_path: `${relativeDir}/${storedName}`
			});
		} catch (error) {
			await unlink(absolutePath).catch(() => undefined);
			throw error;
		}
	}
}

export async function removeChatImageFiles(storagePaths: string[]): Promise<void> {
	const root = resolve('data', 'chat-uploads');
	await Promise.all(storagePaths.map(async (storagePath) => {
		const absolutePath = resolve(root, storagePath);
		if (!absolutePath.startsWith(`${root}${sep}`)) return;
		await unlink(absolutePath).catch(() => undefined);
	}));
}
