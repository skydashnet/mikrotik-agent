<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	let { data } = $props();

	let initialized = false;
	let baseUrl = $state('');
	let apiKey = $state('');
	let hasApiKey = $state(false);
	let activeModel = $state<string | null>(null);
	let models = $state<string[]>([]);
	let notice = $state<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
	let loadingModels = $state(false);
	let saving = $state(false);
	let showKey = $state(false);

	$effect(() => {
		if (!initialized) {
			baseUrl = data.baseUrl;
			hasApiKey = data.hasApiKey;
			activeModel = data.activeModel;
			initialized = true;
		}
	});

	async function responseError(res: Response): Promise<string> {
		const raw = await res.text().catch(() => '');
		try { return JSON.parse(raw).message || raw; } catch { return raw || `HTTP ${res.status}`; }
	}

	async function save(silent = false): Promise<boolean> {
		if (saving) return false;
		saving = true;
		if (!silent) notice = null;
		try {
			const res = await fetch('/api/ai/settings', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ baseUrl: baseUrl.trim(), apiKey: apiKey || undefined, activeModel })
			});
			if (!res.ok) throw new Error(await responseError(res));
			if (apiKey) { hasApiKey = true; apiKey = ''; }
			if (!silent) notice = { type: 'success', text: 'Konfigurasi AI berhasil disimpan.' };
			return true;
		} catch (error) {
			notice = { type: 'error', text: error instanceof Error ? error.message : 'Konfigurasi belum berhasil disimpan.' };
			return false;
		} finally { saving = false; }
	}

	async function detectModels() {
		if (loadingModels) return;
		loadingModels = true;
		notice = { type: 'info', text: 'Menghubungi endpoint dan membaca daftar model…' };
		try {
			if (!(await save(true))) return;
			const res = await fetch('/api/ai/models');
			if (!res.ok) throw new Error(await responseError(res));
			const payload = await res.json();
			models = Array.isArray(payload.models) ? payload.models : [];
			if (!models.length) throw new Error('Endpoint terhubung, tetapi tidak mengembalikan model.');
			if (!activeModel || !models.includes(activeModel)) activeModel = models[0];
			await save(true);
			notice = { type: 'success', text: `${models.length} model ditemukan. ${activeModel} dipilih sebagai model aktif.` };
		} catch (error) {
			notice = { type: 'error', text: error instanceof Error ? error.message : 'Model belum berhasil dideteksi.' };
		} finally { loadingModels = false; }
	}
</script>

<svelte:head><title>Provider AI · MikroTik Manager</title></svelte:head>

<div class="page-head">
	<div><div class="eyebrow">Konfigurasi asisten RouterOS</div><h1>Provider AI</h1><p>Tentukan gateway OpenAI-compatible dan model yang membaca hasil pemeriksaan router.</p></div>
	<span class:ready={hasApiKey && !!activeModel} class="health"><Icon name={hasApiKey && activeModel ? 'check' : 'alert'} size={15} />{hasApiKey && activeModel ? 'Konfigurasi siap' : 'Perlu dilengkapi'}</span>
</div>

<div class="settings-layout">
	<section class="settings-card">
		<div class="card-head"><span><Icon name="server" size={21} /></span><div><h2>Koneksi ke gateway</h2><p>Pengaturan ini hanya berlaku untuk akun Anda.</p></div></div>

		{#if notice}
			<div class="notice {notice.type}"><Icon name={notice.type === 'success' ? 'check' : notice.type === 'error' ? 'alert' : 'activity'} size={17} /><span>{notice.text}</span><button aria-label="Tutup notifikasi" onclick={() => (notice = null)}><Icon name="x" size={15} /></button></div>
		{/if}

		<div class="form-block">
			<div class="block-title"><div><strong>Endpoint</strong><small>Base URL API OpenAI-compatible</small></div></div>
			<label><span>Base URL</span><div class="field"><Icon name="server" size={17} /><input bind:value={baseUrl} type="url" placeholder="http://127.0.0.1:20128/v1" spellcheck="false" /></div><small>Sertakan prefix versi seperti <code>/v1</code> bila endpoint memerlukannya.</small></label>
		</div>

		<div class="form-block">
			<div class="block-title"><div><strong>Autentikasi</strong><small>API key disimpan terenkripsi</small></div></div>
			<label><span>API key {#if hasApiKey}<i class="configured"><Icon name="check" size={12} /> Tersimpan</i>{/if}</span><div class="field"><Icon name="key" size={17} /><input type={showKey ? 'text' : 'password'} bind:value={apiKey} placeholder={hasApiKey ? 'Kosongkan untuk mempertahankan key lama' : 'Masukkan API key'} autocomplete="new-password" /><button onclick={() => (showKey = !showKey)} type="button" aria-label="Tampilkan atau sembunyikan key"><Icon name={showKey ? 'eye-off' : 'eye'} size={17} /></button></div></label>
		</div>

		<div class="form-block">
			<div class="block-title"><div><strong>Model</strong><small>Pilih model untuk percakapan RouterOS</small></div></div>
			<div class="model-row"><label><span>Model aktif</span><div class="field select"><Icon name="settings" size={17} /><select bind:value={activeModel} disabled={!activeModel && !models.length}>{#if !activeModel && !models.length}<option value={null}>Deteksi model terlebih dahulu</option>{/if}{#if activeModel && !models.includes(activeModel)}<option value={activeModel}>{activeModel}</option>{/if}{#each models as model (model)}<option value={model}>{model}</option>{/each}</select><Icon name="chevron-down" size={16} /></div></label><button class="detect" onclick={detectModels} disabled={loadingModels || !baseUrl || (!hasApiKey && !apiKey)}><Icon name={loadingModels ? 'activity' : 'test'} size={17} />{loadingModels ? 'Membaca model…' : 'Tes koneksi & baca model'}</button></div>
		</div>

		<div class="save-row"><p><Icon name="shield" size={16} /> Key tidak pernah dikirim kembali ke browser.</p><button class="save" onclick={() => save()} disabled={saving || !baseUrl || (!hasApiKey && !apiKey)}>{saving ? 'Menyimpan…' : 'Simpan konfigurasi'}<Icon name="arrow-right" size={17} /></button></div>
	</section>

	<aside class="info-column">
		<div class="security-card"><div class="shield"><Icon name="shield" size={21} /></div><h3>Dibatasi hanya-baca</h3><p>AI dapat membaca status melalui tool <code>ros_print</code>, tetapi tidak memiliki tool untuk mengubah konfigurasi.</p><ul><li>Kredensial terenkripsi AES-256-GCM</li><li>Konteks router terisolasi per pengguna</li><li>Tool mutasi tidak diekspos</li></ul></div>
		<div class="flow-card"><h3>Jalur permintaan</h3><ol><li><strong>Pesan pengguna</strong><span>Dikirim dari ruang pemeriksaan router.</span></li><li><strong>Gateway AI</strong><span>9Router meneruskan ke model aktif.</span></li><li><strong>Data RouterOS</strong><span>Dibaca hanya saat model meminta tool.</span></li></ol></div>
	</aside>
</div>

<style>
	.page-head {
		max-width: 1120px;
		margin: 0 auto 24px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
	}
	.eyebrow { margin-bottom: 8px; color: var(--text-tertiary); font-family: var(--font-data); font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
	.page-head h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(28px, 3vw, 36px);
		font-weight: 720;
		letter-spacing: -.045em;
		line-height: 1.02;
	}
	.page-head p { max-width: 650px; margin: 8px 0 0; color: var(--text-secondary); font-size: 13px; line-height: 1.55; }
	.health { display: inline-flex; align-items: center; gap: 6px; padding: 8px 10px; color: var(--status-warning); background: var(--status-warning-surface); border-left: 3px solid currentColor; font-size: 11px; font-weight: 680; }
	.health.ready { color: var(--status-success); background: var(--status-success-surface); }

	.settings-layout { max-width: 1120px; margin: auto; display: grid; grid-template-columns: minmax(0, 1fr) 290px; gap: 28px; align-items: start; }
	.settings-card { background: var(--surface-base); border: 1px solid var(--border-default); border-radius: var(--radius-panel); }
	.card-head { display: flex; align-items: center; gap: 12px; padding: 20px 24px; border-bottom: 1px solid #cfcec6; }
	.card-head > span { width: 30px; height: 30px; display: grid; place-items: center; color: var(--text-primary); border-bottom: 3px solid var(--action-primary); }
	.card-head h2 { margin: 0; color: #20221f; font-size: 17px; }
	.card-head p { margin: 4px 0 0; color: #777a73; font-size: 12px; }
	.notice { display: flex; align-items: flex-start; gap: 8px; margin: 18px 24px 0; padding: 11px 0; border-bottom: 1px solid currentColor; font-size: 12px; line-height: 1.5; }
	.notice.success { color: #167347; }
	.notice.error { color: #b42318; }
	.notice.info { color: #655814; }
	.notice button { margin-left: auto; display: grid; place-items: center; padding: 0; color: currentColor; background: transparent; border: 0; cursor: pointer; }

	.form-block { display: grid; grid-template-columns: 180px minmax(0, 1fr); align-items: start; gap: 26px; padding: 24px; border-bottom: 1px solid #dfded6; }
	.block-title { align-items: flex-start; }
	.block-title > div { display: grid; gap: 5px; }
	.block-title strong { color: #30332e; font-size: 14px; }
	.block-title small { color: #7c7f77; font-size: 11px; line-height: 1.45; }
	.form-block label { display: grid; gap: 8px; color: #4b4e48; font-size: 12px; font-weight: 650; }
	.form-block label > span { display: flex; align-items: center; gap: 7px; }
	.form-block label > small { color: #7d8078; font-size: 11px; font-weight: 500; line-height: 1.45; }
	.form-block code { padding: 1px 3px; color: #41443e; background: #ecebe4; border-radius: 1px; font-size: 11px; }
	.configured { display: inline-flex; align-items: center; gap: 3px; padding: 2px 5px; color: #167347; border: 1px solid #79a58c; border-radius: 2px; font-size: 10px; font-style: normal; font-weight: 650; }
	.field { min-height: 46px; display: flex; align-items: center; gap: 9px; padding: 0 11px; color: #777a73; background: #fffefa; border: 1px solid #bfc0b7; border-radius: 2px; }
	.field:focus-within { color: var(--text-primary); border-color: var(--text-primary); outline: 2px solid var(--focus-ring); outline-offset: 1px; }
	.field input, .field select { min-width: 0; flex: 1; height: 43px; color: #20221f; background: transparent; border: 0; outline: 0; font-size: 14px; }
	.field button { display: grid; place-items: center; padding: 4px; color: #777a73; background: transparent; border: 0; cursor: pointer; }
	.field.select { position: relative; }
	.field select { appearance: none; }
	.model-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: end; }
	.detect { min-height: 46px; display: inline-flex; align-items: center; gap: 7px; padding: 0 13px; color: #42453f; background: #efeee7; border: 1px solid #bfc0b7; border-radius: 2px; cursor: pointer; font-size: 12px; font-weight: 650; }
	.detect:hover { color: #171916; background: #e5e4dc; border-color: #92948b; }
	.detect:disabled { opacity: .45; cursor: not-allowed; }
	.save-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px 24px; }
	.save-row p { display: flex; align-items: center; gap: 6px; margin: 0; color: #777a73; font-size: 11px; }
	.save { min-height: 44px; display: inline-flex; align-items: center; gap: 8px; padding: 0 15px; color: var(--text-primary); background: var(--action-primary); border: 1px solid var(--action-primary-border); border-radius: var(--radius-control); cursor: pointer; font-size: 13px; font-weight: 720; }
	.save:hover { background: var(--action-primary-hover); }
	.save:disabled { opacity: .5; cursor: not-allowed; }

	.info-column { display: grid; gap: 26px; }
	.security-card, .flow-card { padding: 4px 0 20px; border-bottom: 1px solid #aeb0a7; }
	.shield { width: 30px; height: 30px; display: grid; place-items: center; color: var(--text-primary); border-bottom: 3px solid var(--action-primary); }
	.security-card h3, .flow-card h3 { margin: 16px 0 8px; color: #292c27; font-size: 16px; }
	.security-card > p { margin: 0; color: #686b64; font-size: 12px; line-height: 1.65; }
	.security-card code { color: #3f423c; background: #e6e5de; }
	.security-card ul { display: grid; gap: 8px; margin: 17px 0 0; padding: 15px 0 0 16px; border-top: 1px solid #cfcec6; }
	.security-card li { color: #595c55; font-size: 11px; line-height: 1.4; }
	.flow-card { padding-top: 0; }
	.flow-card ol { display: grid; gap: 0; margin: 14px 0 0; padding: 0; list-style: none; counter-reset: flow; border-top: 1px solid var(--border-default); }
	.flow-card li { counter-increment: flow; display: grid; grid-template-columns: 20px 1fr; gap: 2px 8px; padding: 10px 0; border-bottom: 1px solid var(--border-default); }
	.flow-card li::before { content: counter(flow, decimal-leading-zero); grid-row: 1 / 3; color: var(--text-tertiary); font-family: var(--font-data); font-size: 9px; }
	.flow-card li strong { color: var(--text-primary); font-size: 11px; }
	.flow-card li span { color: var(--text-secondary); font-size: 10px; line-height: 1.4; }

	@media (max-width: 1000px) {
		.settings-layout { grid-template-columns: 1fr; }
		.info-column { grid-template-columns: 1fr 1fr; }
	}
	@media (max-width: 680px) {
		.page-head { align-items: flex-start; flex-direction: column; gap: 16px; }
		.page-head h1 { font-size: 30px; }
		.settings-layout { gap: 24px; }
		.form-block { grid-template-columns: 1fr; gap: 15px; padding: 20px 18px; }
		.model-row { grid-template-columns: 1fr; }
		.detect { justify-content: center; }
		.save-row { align-items: stretch; flex-direction: column; padding: 18px; }
		.save-row p { justify-content: flex-start; }
		.save { justify-content: center; }
		.info-column { grid-template-columns: 1fr; }
		.card-head { padding-inline: 18px; }
	}
</style>
