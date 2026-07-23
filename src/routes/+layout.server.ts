import type { LayoutServerLoad } from './$types';

// Expose the current user (or null) to all pages for nav/gating.
export const load: LayoutServerLoad = async ({ locals }) => {
	return { user: locals.user ? { id: locals.user.id, email: locals.user.email, role: locals.user.role } : null };
};
