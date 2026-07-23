<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	let { data } = $props();

	type RouterRow = (typeof data.routers)[number];
	type TestState = { phase: 'testing' | 'online' | 'offline'; detail: string; checkedAt?: number };
	const STATUS_POLL_MS = 30_000;

	let drawerOpen = $state(false);
	let editingId = $state<number | null>(null);
	let saving = $state(false);
	let errorMsg = $state('');
	let testStatus = $state<Record<number, TestState>>({});
	let checking = $state<Record<number, boolean>>({});
	let statusRefreshing = $state(false);
	let deleting = $state<Record<number, boolean>>({});
	let discoveringRest = $state(false);
	let restProfileNote = $state('');
	let restProfileOk = $state(false);
	let f = $state(emptyForm());

	const totalRouters = $derived(data.routers.length);
	const tlsRouters = $derived(data.routers.filter((router) => router.use_tls).length);
	const apiRouters = $derived(data.routers.filter((router) => router.transport === 'api').length);
	const onlineRouters = $derived(Object.values(testStatus).filter((state) => state.phase === 'online').length);
	const offlineRouters = $derived(Object.values(testStatus).filter((state) => state.phase === 'offline').length);
	const latestCheck = $derived(Math.max(0, ...Object.values(testStatus).map((state) => state.checkedAt ?? 0)));

	onMount(() => {
		void refreshRouterStatuses();
		const timer = window.setInterval(() => {
			if (!document.hidden) void refreshRouterStatuses();
		}, STATUS_POLL_MS);
		const onVisibilityChange = () => {
			if (!document.hidden) void refreshRouterStatuses();
		};
		document.addEventListener('visibilitychange', onVisibilityChange);
		return () => {
			window.clearInterval(timer);
			document.removeEventListener('visibilitychange', onVisibilityChange);
		};
	});

	function emptyForm() {
		return { name: '', host: '', transport: 'rest' as 'rest' | 'api', port: '', useTls: true, username: '', password: '' };
	}

	function openAdd() {
		editingId = null;
		f = emptyForm();
		errorMsg = '';
		restProfileNote = '';
		drawerOpen = true;
	}

	function openEdit(router: RouterRow) {
		editingId = Number(router.id);
		f = {
			name: router.name,
			host: router.host,
			transport: router.transport,
			port: router.port ? String(router.port) : '',
			useTls: router.use_tls,
			username: router.username,
			password: ''
		};
		errorMsg = '';
		restProfileNote = '';
		drawerOpen = true;
	}

	function changeTransport(event: Event) {
		const next = (event.currentTarget as HTMLSelectElement).value as 'rest' | 'api';
		if (next === f.transport) return;
		f.transport = next;
		f.port = '';
		restProfileNote = '';
		if (next === 'rest' && editingId !== null) void discoverRestProfile();
	}

	async function discoverRestProfile() {
		if (editingId === null || discoveringRest) return;
		discoveringRest = true;
		restProfileNote = 'Membaca layanan web dari router…';
		restProfileOk = false;
		try {
			const response = await fetch(`/api/routers/${editingId}/rest-profile`, { headers: { Accept: 'application/json' } });
			const profile = await response.json() as { available?: boolean; port?: number; useTls?: boolean; message?: string };
			if (!response.ok) throw new Error(profile.message || `HTTP ${response.status}`);
			if (profile.available && profile.port) {
				f.port = String(profile.port);
				f.useTls = profile.useTls === true;
				restProfileOk = true;
			}
			restProfileNote = profile.message || 'Layanan REST tidak ditemukan.';
		} catch (error) {
			restProfileNote = error instanceof Error ? error.message : 'Port REST gagal dideteksi.';
		} finally {
			discoveringRest = false;
		}
	}

	function closeDrawer() {
		if (!saving) drawerOpen = false;
	}

	function onWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && drawerOpen) closeDrawer();
	}

	async function responseError(res: Response): Promise<string> {
		const raw = await res.text().catch(() => '');
		try { return JSON.parse(raw).message || raw; } catch { return raw || `HTTP ${res.status}`; }
	}

	async function saveRouter(e: SubmitEvent) {
		e.preventDefault();
		if (saving) return;
		saving = true;
		errorMsg = '';
		try {
			const body: Record<string, unknown> = {
				name: f.name.trim(), host: f.host.trim(), transport: f.transport,
				port: f.port ? Number(f.port) : null, useTls: f.useTls,
				username: f.username.trim()
			};
			if (f.password) body.password = f.password;
			const editing = editingId !== null;
			const res = await fetch(editing ? `/api/routers/${editingId}` : '/api/routers', {
				method: editing ? 'PATCH' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) throw new Error(await responseError(res));
			drawerOpen = false;
			await invalidateAll();
			await refreshRouterStatuses();
		} catch (error) {
			errorMsg = error instanceof Error ? error.message : 'Router belum berhasil disimpan.';
		} finally {
			saving = false;
		}
	}

	async function refreshRouterStatuses() {
		if (statusRefreshing) return;
		statusRefreshing = true;
		for (const router of data.routers) {
			const id = Number(router.id);
			if (!testStatus[id]) testStatus[id] = { phase: 'testing', detail: 'Memeriksa koneksi…' };
			checking[id] = true;
		}
		try {
			const res = await fetch('/api/routers/status', { headers: { Accept: 'application/json' } });
			if (!res.ok) throw new Error(await responseError(res));
			const payload = await res.json() as {
				statuses?: Array<{ id: number; ok: boolean; version?: string; error?: string; checkedAt?: number }>;
			};
			for (const status of payload.statuses ?? []) {
				testStatus[status.id] = status.ok
					? { phase: 'online', detail: status.version ? `RouterOS ${status.version}` : 'Terhubung', checkedAt: status.checkedAt }
					: { phase: 'offline', detail: status.error || 'Tidak dapat terhubung', checkedAt: status.checkedAt };
			}
		} catch {
			for (const router of data.routers) {
				const id = Number(router.id);
				if (testStatus[id]?.phase === 'testing') {
					testStatus[id] = { phase: 'offline', detail: 'Pemeriksaan otomatis gagal.' };
				}
			}
		} finally {
			for (const router of data.routers) checking[Number(router.id)] = false;
			statusRefreshing = false;
		}
	}

	async function testRouter(id: number) {
		if (checking[id]) return;
		checking[id] = true;
		testStatus[id] = { phase: 'testing', detail: 'Menghubungkan…' };
		try {
			const res = await fetch(`/api/routers/${id}/test`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
			testStatus[id] = { phase: 'online', detail: body.version ? `RouterOS ${body.version}` : 'Terhubung', checkedAt: Date.now() };
		} catch (error) {
			testStatus[id] = { phase: 'offline', detail: error instanceof Error ? error.message : 'Tidak dapat terhubung', checkedAt: Date.now() };
		} finally {
			checking[id] = false;
		}
	}

	async function deleteRouter(id: number, name: string) {
		if (!confirm(`Hapus “${name}” dari ruang kerja? Kredensial dan riwayat koneksinya akan dilepas.`)) return;
		deleting[id] = true;
		try {
			const res = await fetch(`/api/routers/${id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error(await responseError(res));
			delete testStatus[id];
			await invalidateAll();
		} catch (error) {
			alert(error instanceof Error ? error.message : 'Router belum berhasil dihapus.');
		} finally {
			deleting[id] = false;
		}
	}

	function endpoint(router: RouterRow) {
		const fallback = router.transport === 'api' ? (router.use_tls ? 8729 : 8728) : (router.use_tls ? 443 : 80);
		return `${router.host}:${router.port ?? fallback}`;
	}

	function checkedAt(value?: number) {
		if (!value) return 'Belum diperiksa';
		return `Diperiksa ${new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value))}`;
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

<svelte:head><title>Perangkat RouterOS · MikroTik Manager</title></svelte:head>

<div class="page-head">
	<div>
		<div class="eyebrow">Inventaris RouterOS</div>
		<h1>Perangkat terdaftar</h1>
		<p>Pantau koneksi endpoint dan buka pemeriksaan AI untuk router yang membutuhkan perhatian.</p>
	</div>
	<div class="head-actions">
		<span class="auto-status"><Icon name="activity" size={15} /> {statusRefreshing ? 'Memperbarui status' : latestCheck ? checkedAt(latestCheck) : 'Pemeriksaan otomatis aktif'}</span>
		<button class="primary" onclick={openAdd}><Icon name="plus" size={18} /> Tambah router</button>
	</div>
</div>

<section class="fleet-panel" aria-busy={statusRefreshing}>
	<div class="panel-head">
		<div><h2>Daftar koneksi</h2><span>{totalRouters} endpoint, {tlsRouters} memakai TLS, {apiRouters} memakai Binary API</span></div>
		<div class="connection-summary">
			<span class="summary-online"><Icon name="check" size={14} /> {onlineRouters} online</span>
			{#if offlineRouters}<span class="summary-offline"><Icon name="alert" size={14} /> {offlineRouters} perlu diperiksa</span>{/if}
		</div>
	</div>

	{#if data.routers.length === 0}
		<div class="empty-state">
			<div class="empty-art"><Icon name="router" size={32} /></div>
		<h2>Belum ada router</h2>
			<p>Tambahkan endpoint pertama untuk menguji koneksi dan mulai membaca kondisi RouterOS.</p>
			<button class="primary" onclick={openAdd}><Icon name="plus" size={18} /> Tambah router pertama</button>
		</div>
	{:else}
		<div class="list-labels" aria-hidden="true"><span>Perangkat dan endpoint</span><span>Metode akses</span><span>Tindakan</span></div>
		<div class="router-grid">
			{#each data.routers as router (router.id)}
				{@const state = testStatus[Number(router.id)]}
				<article class="router-card">
					<div class="router-top">
						<div class="device-icon"><Icon name="router" size={25} /></div>
						<div class="identity">
							<h3>{router.name}</h3>
							<span class="endpoint">{endpoint(router)}</span>
						</div>
						<span class:online={state?.phase === 'online'} class:offline={state?.phase === 'offline'} class:testing={state?.phase === 'testing'} class="state-pill">
							<Icon name={state?.phase === 'online' ? 'check' : state?.phase === 'offline' ? 'alert' : 'activity'} size={13} />{state?.phase === 'online' ? 'Online' : state?.phase === 'offline' ? 'Tidak terhubung' : 'Memeriksa'}
						</span>
					</div>

					<div class="router-meta">
						<span><Icon name="server" size={15} /> {router.transport === 'api' ? 'Binary API' : 'REST API'}</span>
						<span><Icon name={router.use_tls ? 'lock' : 'alert'} size={15} /> {router.use_tls ? 'TLS aktif' : 'Tanpa TLS'}</span>
						<span><Icon name="key" size={15} /> {router.username}</span>
					</div>

					{#if state?.phase === 'offline'}
						<div class="test-detail {state.phase}"><strong>Koneksi gagal.</strong> {state.detail} <button onclick={() => testRouter(Number(router.id))} disabled={checking[Number(router.id)]}>Uji ulang</button></div>
					{/if}

					<div class="card-actions">
						<small>{checkedAt(state?.checkedAt)}</small>
						<a class="chat-btn" href={`/chat/${router.id}`}>Buka pemeriksaan <Icon name="arrow-right" size={16} /></a>
						<button title="Periksa koneksi sekarang" aria-label={`Periksa koneksi ${router.name}`} onclick={() => testRouter(Number(router.id))} disabled={checking[Number(router.id)] ?? true}><Icon name="test" size={17} /></button>
						<button title="Edit router" aria-label={`Edit ${router.name}`} onclick={() => openEdit(router)}><Icon name="edit" size={17} /></button>
						<button class="delete" title="Hapus router" aria-label={`Hapus ${router.name}`} onclick={() => deleteRouter(Number(router.id), router.name)} disabled={deleting[Number(router.id)]}><Icon name="trash" size={17} /></button>
					</div>
				</article>
			{/each}
		</div>
	{/if}
</section>

{#if drawerOpen}
	<button class="drawer-scrim" aria-label="Tutup formulir" onclick={closeDrawer}></button>
	<div class="drawer" role="dialog" aria-modal="true" aria-label={editingId ? 'Edit router' : 'Tambah router'}>
		<div class="drawer-head">
			<div><span class="mini-icon"><Icon name={editingId ? 'edit' : 'plus'} size={18} /></span><div><h2>{editingId ? 'Edit router' : 'Hubungkan router'}</h2><p>{editingId ? 'Perbarui endpoint atau kredensial perangkat.' : 'Daftarkan endpoint RouterOS baru ke ruang kerja.'}</p></div></div>
			<button onclick={closeDrawer} aria-label="Tutup"><Icon name="x" /></button>
		</div>
		<form onsubmit={saveRouter}>
			{#if errorMsg}<div class="form-error"><Icon name="alert" size={17} /><span>{errorMsg}</span></div>{/if}
			<div class="form-section">
				<div class="section-title">Identitas perangkat</div>
				<label><span>Nama router</span><input bind:value={f.name} required maxlength="100" placeholder="Core Router Jakarta" autocomplete="off" /></label>
				<label><span>Host atau IP</span><input bind:value={f.host} required maxlength="255" placeholder="192.168.88.1" spellcheck="false" /></label>
			</div>
			<div class="form-section two-col">
				<div class="section-title full">Koneksi RouterOS</div>
				<label><span>Transport</span><select value={f.transport} onchange={changeTransport}><option value="rest">REST · RouterOS v7</option><option value="api">Binary API · v6/v7</option></select></label>
				<label><span>Port <em>opsional</em></span><input bind:value={f.port} inputmode="numeric" type="number" min="1" max="65535" placeholder={f.transport === 'rest' ? (f.useTls ? '443' : '80') : (f.useTls ? '8729' : '8728')} /></label>
				<label class="toggle-row full"><span><strong>Gunakan TLS</strong><small>Enkripsi koneksi ke endpoint router</small></span><input type="checkbox" bind:checked={f.useTls} /><i></i></label>
				{#if f.transport === 'rest'}
					<div class="rest-help full">
						<p>REST memakai layanan <code>{f.useTls ? 'www-ssl' : 'www'}</code>. Port Binary API tidak dapat dipakai untuk REST dan grup user wajib memiliki policy <code>rest-api</code>.</p>
						{#if editingId !== null && data.routers.find((router) => Number(router.id) === editingId)?.transport === 'api'}<button type="button" onclick={discoverRestProfile} disabled={discoveringRest}>{discoveringRest ? 'Mendeteksi…' : 'Deteksi port dari router'}</button>{/if}
						{#if restProfileNote}<span class:ok={restProfileOk}>{restProfileNote}</span>{/if}
					</div>
				{/if}
			</div>
			<div class="form-section">
				<div class="section-title">Kredensial</div>
				<label><span>Username</span><input bind:value={f.username} required maxlength="100" autocomplete="username" placeholder="api-manager" /></label>
				<label><span>Password {#if editingId}<em>kosongkan jika tetap</em>{/if}</span><input type="password" bind:value={f.password} required={!editingId} maxlength="1024" autocomplete="new-password" placeholder={editingId ? 'Tidak diubah' : '••••••••••••'} /></label>
				<p class="secure-note"><Icon name="shield" size={16} /> Kredensial dienkripsi AES-256-GCM sebelum disimpan.</p>
			</div>
			<div class="drawer-actions"><button type="button" onclick={closeDrawer} disabled={saving}>Batal</button><button class="primary" type="submit" disabled={saving}>{saving ? 'Menyimpan…' : editingId ? 'Simpan perubahan' : 'Hubungkan router'}</button></div>
		</form>
	</div>
{/if}

<style>
	.page-head {
		max-width: 1240px;
		margin: 0 auto 24px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 28px;
	}
	.eyebrow {
		margin-bottom: 8px;
		color: var(--text-tertiary);
		font-family: var(--font-data);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: .06em;
		text-transform: uppercase;
	}
	h1 {
		margin: 0;
		color: var(--text-primary);
		font-family: var(--font-display);
		font-size: clamp(28px, 3vw, 36px);
		font-weight: 730;
		letter-spacing: -.035em;
		line-height: 1.08;
	}
	.page-head p { max-width: 650px; margin: 8px 0 0; color: var(--text-secondary); font-size: 13px; line-height: 1.55; }
	.head-actions { display: flex; align-items: center; gap: 14px; }
	.auto-status { display: inline-flex; align-items: center; gap: 6px; color: var(--text-tertiary); font-family: var(--font-data); font-size: 10px; white-space: nowrap; }
	.primary {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 0 17px;
		color: var(--text-primary);
		background: var(--action-primary);
		border: 1px solid var(--action-primary-border);
		border-radius: var(--radius-control);
		cursor: pointer;
		font-size: 13px;
		font-weight: 720;
	}
	.primary:hover { background: var(--action-primary-hover); }
	.primary:disabled { opacity: .55; cursor: wait; }

	.fleet-panel {
		max-width: 1240px;
		margin: 0 auto;
		background: var(--surface-base);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-panel);
		overflow: hidden;
	}
	.panel-head {
		min-height: 62px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		padding: 15px 20px;
		border-bottom: 1px solid var(--border-default);
	}
	.panel-head > div:first-child { display: flex; align-items: baseline; flex-wrap: wrap; gap: 10px; }
	.panel-head h2 { margin: 0; font-size: 16px; font-weight: 700; }
	.panel-head span { color: var(--text-tertiary); font-size: 11px; }
	.connection-summary { display: flex; align-items: center; gap: 14px; }
	.connection-summary span { display: inline-flex; align-items: center; gap: 5px; font-weight: 650; white-space: nowrap; }
	.connection-summary .summary-online { color: var(--status-success); }
	.connection-summary .summary-offline { color: var(--status-danger); }

	.list-labels { display: grid; grid-template-columns: minmax(260px, 1fr) minmax(270px, .9fr) auto; gap: 20px; padding: 9px 20px; color: var(--text-tertiary); background: var(--surface-subtle); border-bottom: 1px solid var(--border-default); font-family: var(--font-data); font-size: 9px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
	.router-grid { display: block; }
	.router-card {
		min-width: 0;
		display: grid;
		grid-template-columns: minmax(260px, 1fr) minmax(270px, .9fr) auto;
		align-items: center;
		gap: 20px;
		padding: 18px 20px;
		background: var(--surface-base);
		border-bottom: 1px solid #dfded6;
	}
	.router-card:last-child { border-bottom: 0; }
	.router-card:hover { background: #faf9f4; }
	.router-top { min-width: 0; display: flex; align-items: center; gap: 13px; }
	.device-icon {
		width: 29px;
		height: 29px;
		flex: 0 0 auto;
		display: grid;
		place-items: center;
		color: var(--text-primary);
	}
	.identity { min-width: 0; display: grid; gap: 4px; }
	.identity h3 { overflow: hidden; margin: 0; color: var(--text-primary); font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
	.endpoint { overflow: hidden; color: var(--text-secondary); font-family: var(--font-data); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
	.state-pill {
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--text-tertiary);
		font-size: 11px;
		font-weight: 650;
		white-space: nowrap;
	}
	.state-pill.online { color: var(--status-success); }
	.state-pill.offline { color: var(--status-danger); }
	.state-pill.testing { color: var(--status-warning); animation: pulse 1s infinite; }
	.router-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 13px; }
	.router-meta span { display: inline-flex; align-items: center; gap: 5px; color: #656861; font-size: 12px; white-space: nowrap; }
	.test-detail { grid-column: 1 / -1; display: flex; align-items: baseline; gap: 5px; margin: -8px 0 0 42px; padding: 8px 10px; color: var(--status-danger); background: var(--status-danger-surface); border-left: 3px solid var(--status-danger); font-size: 11px; line-height: 1.5; }
	.test-detail button { margin-left: auto; padding: 2px 0; color: inherit; background: transparent; border: 0; border-bottom: 1px solid currentColor; cursor: pointer; font-size: 11px; font-weight: 700; white-space: nowrap; }
	.card-actions { display: flex; align-items: center; gap: 6px; }
	.card-actions > small { display: none; color: var(--text-tertiary); font-family: var(--font-data); font-size: 9px; }
	.card-actions a, .card-actions button {
		min-height: 38px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: #50534d;
		background: var(--surface-base);
		border: 1px solid var(--border-default);
		border-radius: 2px;
		cursor: pointer;
	}
	.card-actions button { width: 38px; padding: 0; }
	.card-actions button:hover { color: #171916; background: #ecebe4; border-color: #9fa097; }
	.card-actions .delete:hover { color: #b42318; background: #fff3f1; border-color: #d99a92; }
	.card-actions button:disabled { opacity: .45; cursor: wait; }
	.chat-btn {
		gap: 8px;
		padding: 0 13px;
		color: var(--text-inverse) !important;
		background: var(--surface-inverse) !important;
		border-color: var(--surface-inverse) !important;
		text-decoration: none;
		font-size: 12px;
		font-weight: 680;
		white-space: nowrap;
	}
	.chat-btn:hover { background: #343833 !important; }

	.empty-state {
		min-height: 360px;
		display: grid;
		align-content: center;
		justify-items: start;
		padding: clamp(34px, 7vw, 82px);
		text-align: left;
	}
	.empty-art { width: 42px; height: 42px; display: grid; place-items: center; color: var(--text-primary); border-bottom: 3px solid var(--action-primary); }
	.empty-state h2 { margin: 22px 0 7px; font-size: 24px; }
	.empty-state p { max-width: 500px; margin: 0 0 22px; color: #6c6f68; font-size: 14px; line-height: 1.6; }

	.drawer-scrim { position: fixed; inset: 0; z-index: 60; width: 100%; height: 100%; border: 0; background: rgba(12, 13, 11, .62); }
	.drawer {
		position: fixed;
		z-index: 65;
		inset: 0 0 0 auto;
		width: min(520px, 100%);
		overflow-y: auto;
		color: #20221f;
		background: var(--surface-work);
		border-left: 1px solid var(--border-strong);
		box-shadow: -16px 0 38px rgba(12, 13, 11, .12);
		animation: slide-in .18s ease;
	}
	.drawer-head {
		position: sticky;
		top: 0;
		z-index: 2;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: 22px 24px;
		background: var(--surface-base);
		border-bottom: 1px solid var(--border-default);
	}
	.drawer-head > div { display: flex; gap: 12px; }
	.mini-icon { width: 30px; height: 30px; display: grid; place-items: center; color: var(--text-primary); border-bottom: 3px solid var(--action-primary); }
	.drawer-head h2 { margin: 0; font-size: 18px; }
	.drawer-head p { margin: 5px 0 0; color: #6e716a; font-size: 12px; line-height: 1.45; }
	.drawer-head > button { width: 34px; height: 34px; display: grid; place-items: center; color: #5d6059; background: transparent; border: 1px solid transparent; border-radius: 2px; cursor: pointer; }
	.drawer-head > button:hover { background: #ecebe4; border-color: #cfcec6; }
	.drawer form { display: grid; padding: 0 24px 28px; }
	.form-error { display: flex; gap: 8px; margin-top: 18px; padding: 11px 0; color: #b42318; border-bottom: 1px solid #d99a92; font-size: 12px; line-height: 1.5; }
	.form-section { display: grid; gap: 15px; padding: 22px 0; border-bottom: 1px solid #cfcec6; }
	.form-section.two-col { grid-template-columns: 1fr 1fr; }
	.section-title { color: #2c2f2a; font-size: 14px; font-weight: 720; }
	.full { grid-column: 1 / -1; }
	.form-section label:not(.toggle-row) { display: grid; gap: 7px; color: #4e514b; font-size: 12px; font-weight: 650; }
	.form-section label span { display: flex; justify-content: space-between; }
	.form-section em { color: #898c84; font-size: 11px; font-style: normal; font-weight: 500; }
	.form-section input:not([type="checkbox"]), .form-section select {
		width: 100%;
		min-height: 44px;
		padding: 0 11px;
		color: #20221f;
		background: var(--surface-base);
		border: 1px solid var(--border-strong);
		border-radius: 2px;
		font-size: 13px;
	}
	.form-section input:focus, .form-section select:focus { border-color: var(--text-primary); outline: 2px solid var(--focus-ring); outline-offset: 1px; }
	.toggle-row { position: relative; display: flex; align-items: center; justify-content: space-between; cursor: pointer; }
	.toggle-row > span { display: grid !important; gap: 3px; }
	.toggle-row strong { color: #343731; font-size: 12px; }
	.toggle-row small { color: #80837b; font-size: 11px; }
	.toggle-row input { position: absolute; opacity: 0; }
	.toggle-row i { width: 38px; height: 22px; padding: 3px; background: #b9bbb2; border-radius: 11px; transition: .15s; }
	.toggle-row i::after { content: ''; display: block; width: 16px; height: 16px; background: #fff; border-radius: 50%; transition: .15s; }
	.toggle-row input:checked + i { background: #53631a; }
	.toggle-row input:checked + i::after { transform: translateX(16px); }
	.rest-help { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px 12px; padding: 10px 0 0; border-top: 1px solid #d8d7cf; }
	.rest-help p { grid-column: 1 / -1; margin: 0; color: #666961; font-size: 11px; line-height: 1.55; }
	.rest-help code { padding: 1px 4px; color: #303719; background: #e5ebc8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; }
	.rest-help button { min-height: 32px; padding: 0 9px; color: #363a33; background: #fffefa; border: 1px solid #bfc0b7; border-radius: 2px; cursor: pointer; font-size: 10px; font-weight: 700; }
	.rest-help button:disabled { opacity: .55; cursor: wait; }
	.rest-help span { color: #8b4c25; font-size: 10px; line-height: 1.45; }
	.rest-help span.ok { color: #167347; }
	.secure-note { display: flex; align-items: center; gap: 7px; margin: 0; color: #3f644f; font-size: 11px; }
	.drawer-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 20px; }
	.drawer-actions > button:not(.primary) { min-height: 44px; padding: 0 15px; color: #4d504a; background: #fffefa; border: 1px solid #bfc0b7; border-radius: 2px; cursor: pointer; font-size: 12px; font-weight: 650; }

	@keyframes slide-in { from { transform: translateX(24px); opacity: .75; } }
	@keyframes pulse { 50% { opacity: .3; } }
	@media (max-width: 1050px) {
		.list-labels { grid-template-columns: minmax(240px, 1fr) auto; }
		.list-labels span:nth-child(2) { display: none; }
		.router-card { grid-template-columns: minmax(240px, 1fr) auto; }
		.router-meta { grid-column: 1 / -1; padding-left: 42px; }
	}
	@media (max-width: 680px) {
		.page-head { align-items: stretch; flex-direction: column; gap: 20px; }
		.head-actions { align-items: stretch; flex-direction: column; gap: 10px; }
		.page-head .primary { width: 100%; }
		h1 { font-size: 30px; }
		.panel-head { align-items: flex-start; flex-direction: column; gap: 7px; }
		.connection-summary { width: 100%; justify-content: space-between; }
		.list-labels { display: none; }
		.router-card { display: block; padding: 18px; }
		.router-meta { margin: 16px 0; padding: 0; gap: 10px 14px; }
		.card-actions { flex-wrap: wrap; padding-top: 15px; border-top: 1px solid #dfded6; }
		.card-actions > small { width: 100%; display: block; margin-bottom: 3px; }
		.chat-btn { flex: 1; }
		.test-detail { margin: 0 0 13px; flex-wrap: wrap; }
		.drawer-head, .drawer form { padding-inline: 18px; }
		.form-section.two-col { grid-template-columns: 1fr; }
		.full { grid-column: auto; }
	}
</style>
