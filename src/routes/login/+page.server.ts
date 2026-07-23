import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { z } from 'zod';
import { countUsers, getUserByEmail, verifyLoginPassword, createSession } from '$lib/server/auth';

const schema = z.object({
	email: z.string().trim().email().max(255),
	password: z.string().min(1).max(1024)
});

const attempts = new Map<string, { count: number; resetAt: number }>();
const ATTEMPT_WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 8;

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) throw redirect(303, '/');
	// No users yet -> go bootstrap the admin.
	if ((await countUsers()) === 0) throw redirect(303, '/setup');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const form = Object.fromEntries(await request.formData());
		const parsed = schema.safeParse(form);
		if (!parsed.success)
			return fail(400, { error: 'Email atau password tidak valid.', email: String(form.email ?? '') });

		const email = parsed.data.email.trim().toLowerCase();
		let address = 'unknown';
		try { address = getClientAddress(); } catch { /* adapter may not expose it */ }
		const attemptKey = `${address}:${email}`;
		const now = Date.now();
		const current = attempts.get(attemptKey);
		if (current && current.resetAt > now && current.count >= MAX_ATTEMPTS) {
			return fail(429, { error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.', email });
		}
		if (current && current.resetAt <= now) attempts.delete(attemptKey);

		const user = await getUserByEmail(email);
		// Constant-ish response: same error whether user missing or password wrong.
		const passwordValid = await verifyLoginPassword(parsed.data.password, user?.password_hash);
		if (!user || !passwordValid) {
			const previous = attempts.get(attemptKey);
			attempts.set(attemptKey, {
				count: (previous?.resetAt ?? 0) > now ? previous!.count + 1 : 1,
				resetAt: (previous?.resetAt ?? 0) > now ? previous!.resetAt : now + ATTEMPT_WINDOW_MS
			});
			return fail(400, { error: 'Email atau password salah.', email });
		}
		attempts.delete(attemptKey);
		const session = await createSession(user.id);
		cookies.set('session', session.id, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: process.env.NODE_ENV === 'production',
			expires: session.expiresAt
		});
		throw redirect(303, '/');
	}
};
