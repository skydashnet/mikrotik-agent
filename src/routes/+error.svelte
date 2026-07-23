<script lang="ts">
	import { page } from '$app/stores';
	import Icon from '$lib/components/Icon.svelte';
</script>

<svelte:head><title>{$page.status} · MikroTik Manager</title></svelte:head>

<section class="error-page">
	<div class="error-code">{$page.status}</div>
	<div class="icon"><Icon name="alert" size={28} /></div>
	<h1>{ $page.status === 404 ? 'Halaman tidak ditemukan' : 'Terjadi gangguan' }</h1>
	<p>{$page.error?.message ?? 'Permintaan belum dapat diproses. Coba kembali ke halaman utama.'}</p>
	<div class="actions">
		<a href="/"><Icon name="arrow-left" size={17} /> Kembali ke perangkat</a>
		{#if $page.status !== 404}<button onclick={() => location.reload()}><Icon name="activity" size={17} /> Coba muat ulang</button>{/if}
	</div>
</section>

<style>
	.error-page { width: min(720px, 100%); min-height: calc(100vh - 90px); display: grid; align-content: center; justify-items: start; margin: 0 auto; padding: 50px 20px; text-align: left; }
	.error-code { color: var(--text-tertiary); border-bottom: 4px solid var(--action-primary); font-family: var(--font-data); font-size: 15px; font-weight: 700; line-height: 1.4; }
	.icon { display: none; }
	h1 { margin: 24px 0 10px; font-family: var(--font-display); font-size: clamp(30px, 5vw, 44px); letter-spacing: -.04em; }
	p { max-width: 540px; margin: 0; color: var(--text-secondary); font-size: 14px; line-height: 1.65; }
	.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 26px; }
	a, button { min-height: 42px; display: inline-flex; align-items: center; gap: 7px; padding: 0 15px; border-radius: var(--radius-control); cursor: pointer; font-size: 13px; font-weight: 680; }
	a { color: var(--text-inverse); background: var(--surface-inverse); border: 1px solid var(--surface-inverse); text-decoration: none; }
	a:hover { background: #343833; }
	button { color: var(--text-primary); background: var(--surface-base); border: 1px solid var(--border-strong); }
	button:hover { background: var(--surface-subtle); }
</style>
