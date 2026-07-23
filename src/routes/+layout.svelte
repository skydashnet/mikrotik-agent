<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/stores';
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';

	let { children, data } = $props();
	let mobileNavOpen = $state(false);
	const bare = $derived(['/login', '/setup'].includes($page.url.pathname));
	const routerSection = $derived($page.url.pathname === '/' || $page.url.pathname.startsWith('/chat/'));
	const initials = $derived(data.user?.email?.slice(0, 2).toUpperCase() ?? 'MM');

	$effect(() => {
		$page.url.pathname;
		mobileNavOpen = false;
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#1c1f1b" />
	<meta name="description" content="Kelola dan observasi router MikroTik dari satu ruang kerja." />
	<title>MikroTik Manager</title>
</svelte:head>

{#if bare || !data.user}
	{@render children()}
{:else}
	<div class="app-shell">
		<button class="mobile-menu" aria-label="Buka navigasi" aria-expanded={mobileNavOpen} onclick={() => (mobileNavOpen = true)}>
			<Icon name="menu" size={20} /><span>Menu</span>
		</button>
		{#if mobileNavOpen}
			<button class="scrim" aria-label="Tutup navigasi" onclick={() => (mobileNavOpen = false)}></button>
		{/if}
		<aside class:open={mobileNavOpen}>
			<div class="brand-row">
				<a href="/" class="brand" aria-label="MikroTik Manager">
					<span class="brand-mark"><Icon name="router" size={22} strokeWidth={2} /></span>
					<span><strong>MikroTik</strong><small>Manager</small></span>
				</a>
				<button class="close-nav" aria-label="Tutup navigasi" onclick={() => (mobileNavOpen = false)}><Icon name="x" /></button>
			</div>

			<div class="workspace-label">Operasi jaringan</div>
			<nav aria-label="Navigasi utama">
				<a href="/" class:active={routerSection}>
					<span class="nav-icon"><Icon name="router" /></span>
					<span><strong>Perangkat RouterOS</strong><small>Status dan pemeriksaan</small></span>
				</a>
				<a href="/settings" class:active={$page.url.pathname === '/settings'}>
					<span class="nav-icon"><Icon name="settings" /></span>
					<span><strong>Provider AI</strong><small>Gateway dan model</small></span>
				</a>
			</nav>

			<div class="sidebar-note">
				<div class="note-icon"><Icon name="shield" size={18} /></div>
				<div><strong>Akses hanya-baca</strong><span>AI tidak memiliki izin mengubah router.</span></div>
			</div>

			<form method="POST" action="/logout" use:enhance class="account">
				<span class="avatar">{initials}</span>
				<span class="account-copy"><strong>{data.user.email}</strong><small>{data.user.role === 'admin' ? 'Administrator' : 'Operator'}</small></span>
				<button type="submit" title="Keluar" aria-label="Keluar"><Icon name="logout" size={18} /></button>
			</form>
		</aside>
		<main>{@render children()}</main>
	</div>
{/if}

<style>
	.app-shell {
		min-height: 100vh;
		padding-left: 236px;
		color: var(--text-primary);
		background: var(--surface-work);
		font-family: var(--font-body);
	}
	aside {
		position: fixed;
		inset: 0 auto 0 0;
		z-index: 40;
		width: 236px;
		display: flex;
		flex-direction: column;
		padding: 22px 15px 15px;
		color: #c8cbc3;
		background: var(--surface-inverse);
		border-right: 1px solid #050605;
	}
	.brand-row { display: flex; align-items: center; justify-content: space-between; margin: 0 5px 42px; }
	.brand { display: flex; align-items: center; gap: 11px; color: #f7f8f3; text-decoration: none; }
	.brand-mark {
		width: 36px;
		height: 30px;
		display: grid;
		place-items: center;
		color: #171916;
		background: var(--action-primary);
		border: 1px solid var(--action-primary-border);
		border-radius: 2px;
	}
	.brand > span:last-child { display: grid; line-height: 1.05; }
	.brand strong { font-size: 14px; font-weight: 720; letter-spacing: .01em; }
	.brand small { margin-top: 4px; color: #8f9389; font-size: 10px; letter-spacing: .04em; }
	.workspace-label { padding: 0 10px 9px; color: #858980; font-family: var(--font-data); font-size: 10px; letter-spacing: .035em; text-transform: uppercase; }
	nav { display: grid; gap: 2px; }
	nav a {
		min-height: 52px;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 9px;
		color: #adb0a8;
		border: 1px solid transparent;
		border-radius: 2px;
		text-decoration: none;
		font-size: 12px;
	}
	nav a > span:last-child { min-width: 0; display: grid; gap: 3px; }
	nav a strong { color: inherit; font-size: 12px; font-weight: 680; }
	nav a small { color: #767b72; font-size: 10px; font-weight: 500; }
	nav a:hover { color: #fff; background: #242723; }
	nav a.active { color: #171916; background: var(--action-primary); border-color: var(--action-primary-border); }
	nav a.active small { color: #4e541e; }
	.nav-icon { display: grid; place-items: center; color: currentColor; }
	.sidebar-note {
		margin-top: auto;
		display: flex;
		gap: 10px;
		padding: 16px 7px;
		border-top: 1px solid #343733;
		border-bottom: 1px solid #343733;
	}
	.note-icon { width: 25px; flex: 0 0 auto; display: grid; place-items: start center; padding-top: 1px; color: var(--action-primary); }
	.sidebar-note div:last-child { display: grid; gap: 3px; }
	.sidebar-note strong { color: #e3e5de; font-size: 12px; font-weight: 650; }
	.sidebar-note span { color: #858980; font-size: 10px; line-height: 1.4; }
	.account { display: flex; align-items: center; gap: 9px; margin-top: 10px; padding: 10px 4px 0; }
	.avatar {
		width: 31px;
		height: 31px;
		flex: 0 0 auto;
		display: grid;
		place-items: center;
		color: #171916;
		background: var(--action-primary);
		border-radius: 2px;
		font-size: 10px;
		font-weight: 800;
	}
	.account-copy { min-width: 0; flex: 1; display: grid; gap: 2px; }
	.account-copy strong { overflow: hidden; color: #e8eae3; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
	.account-copy small { color: #7f837a; font-size: 10px; }
	.account button, .close-nav, .mobile-menu { display: grid; place-items: center; border: 0; cursor: pointer; }
	.account button { width: 32px; height: 32px; color: #8a8e85; background: transparent; border-radius: 2px; }
	.account button:hover { color: #fff; background: #2a2d29; }
	main { min-height: 100vh; padding: 34px clamp(24px, 3.4vw, 56px) 48px; overflow: hidden; background: var(--surface-work); }
	.mobile-menu, .close-nav, .scrim { display: none; }

	@media (max-width: 900px) {
		.app-shell { padding-left: 0; padding-top: 68px; }
		aside {
			width: min(280px, 86vw);
			transform: translateX(-102%);
			transition: transform .18s ease;
		}
		aside.open { transform: translateX(0); }
		.mobile-menu {
			position: fixed;
			z-index: 30;
			top: 14px;
			left: 16px;
			width: auto;
			height: 40px;
			display: inline-flex;
			gap: 7px;
			padding: 0 12px;
			color: #171916;
			background: var(--action-primary);
			border: 1px solid var(--action-primary-border);
			border-radius: 2px;
			font-size: 12px;
			font-weight: 700;
		}
		.close-nav { width: 34px; height: 34px; display: grid; color: #aeb2a9; background: transparent; border-radius: 2px; }
		.scrim { display: block; position: fixed; inset: 0; z-index: 35; width: 100%; height: 100%; border: 0; background: rgba(10, 11, 9, .68); }
		main { padding: 24px 18px 38px; }
	}
	@media (max-width: 520px) { main { padding-inline: 16px; } }
</style>
