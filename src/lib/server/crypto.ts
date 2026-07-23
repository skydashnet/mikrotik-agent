import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '$env/dynamic/private';

function getMasterKey(): Buffer {
	const hex = env.APP_ENCRYPTION_KEY;
	if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) {
		throw new Error('APP_ENCRYPTION_KEY must be a 64-char hex string (32 bytes). Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
	}
	return Buffer.from(hex, 'hex');
}

// AES-256-GCM: authenticated encryption, protects against tampering.
// Format: iv(12) + authTag(16) + ciphertext, all base64.
export function encrypt(plaintext: string): string {
	const key = getMasterKey();
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decrypt(ciphertext: string): string {
	const key = getMasterKey();
	const buf = Buffer.from(ciphertext, 'base64');
	if (buf.length < 28) throw new Error('Encrypted value is invalid or truncated');
	const iv = buf.subarray(0, 12);
	const tag = buf.subarray(12, 28);
	const ct = buf.subarray(28);
	const decipher = createDecipheriv('aes-256-gcm', key, iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
