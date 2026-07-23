import { redirect, type Handle } from '@sveltejs/kit';
import { getSession } from '$lib/server/auth';

const SESSION_COOKIE = 'session';

// Public routes accessible without auth.
const PUBLIC_PATHS = ['/login', '/setup'];

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE) ?? null;
	event.locals.user = null;
	event.locals.sessionId = null;

	if (token) {
		const session = await getSession(token);
		if (session) {
			event.locals.user = session.user;
			event.locals.sessionId = session.id;
		} else {
			event.cookies.delete(SESSION_COOKIE, { path: '/' });
		}
	}

	const path = event.url.pathname;
	const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'));
	const isApiAuth = path.startsWith('/api/auth');

	if (!event.locals.user && !isPublic && !isApiAuth) {
		if (path.startsWith('/api')) {
			return new Response('Unauthorized', { status: 401 });
		}
		throw redirect(303, '/login');
	}

	return resolve(event);
};
