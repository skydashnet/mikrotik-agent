<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	let { form } = $props();
	let showPassword = $state(false);
	let password = $state('');
	let submitting = $state(false);
	const strength = $derived(password.length >= 12 ? 3 : password.length >= 10 ? 2 : password.length >= 8 ? 1 : 0);
</script>

<svelte:head><title>Setup admin · MikroTik Manager</title></svelte:head>

<main class="setup-shell">
	<section class="intro">
		<div class="brand"><span><Icon name="router" size={23} /></span><div><strong>MikroTik</strong><small>Manager</small></div></div>
		<div class="intro-copy"><div class="step">Penyetelan awal</div><h1>Aktifkan administrator pertama.</h1><p>Akun ini mengelola daftar router, kredensial terenkripsi, dan provider AI untuk seluruh ruang kerja.</p></div>
		<div class="features">
			<p><strong>Kredensial router</strong><small>Disimpan menggunakan AES-256-GCM.</small></p>
			<p><strong>Sesi RouterOS</strong><small>Koneksi dipakai ulang untuk mengurangi login berulang.</small></p>
			<p><strong>Akses asisten</strong><small>Tool hanya membaca data dan tidak memiliki operasi mutasi.</small></p>
		</div>
	</section>
	<section class="setup-panel">
		<div class="form-wrap">
			<div class="heading"><div class="admin-icon"><Icon name="key" size={22} /></div><h2>Buat administrator</h2><p>Gunakan identitas yang akan mengelola ruang kerja ini.</p></div>
			<form method="POST" use:enhance={() => { submitting = true; return async ({ update }) => { await update(); submitting = false; }; }}>
				{#if form?.error}<div class="error"><Icon name="alert" size={17} /><span>{form.error}</span></div>{/if}
				<label><span>Email administrator</span><div class="field"><Icon name="mail" size={17} /><input name="email" type="email" value={form?.email ?? ''} required autocomplete="email" placeholder="admin@network.local" /></div></label>
				<label><span>Password utama</span><div class="field"><Icon name="key" size={17} /><input name="password" bind:value={password} type={showPassword ? 'text' : 'password'} required minlength="8" autocomplete="new-password" placeholder="Minimal 8 karakter" /><button type="button" aria-label="Tampilkan atau sembunyikan password" onclick={() => (showPassword = !showPassword)}><Icon name={showPassword ? 'eye-off' : 'eye'} size={17} /></button></div><div class="strength"><i class:on={strength >= 1}></i><i class:on={strength >= 2}></i><i class:on={strength >= 3}></i><small>{strength === 3 ? 'Kuat' : strength === 2 ? 'Baik' : strength === 1 ? 'Cukup' : 'Gunakan 12+ karakter'}</small></div></label>
				<div class="notice"><Icon name="shield" size={17} /><p><strong>Akun akses penuh</strong><span>Administrator dapat melihat router dan mengubah konfigurasi provider AI.</span></p></div>
				<button class="submit" type="submit" disabled={submitting || password.length < 8}>{submitting ? 'Membuat administrator…' : 'Buat administrator'}<Icon name="arrow-right" size={17} /></button>
			</form>
		</div>
	</section>
</main>

<style>
	.setup-shell { min-height: 100vh; display: grid; grid-template-columns: minmax(360px, .85fr) minmax(480px, 1.15fr); font-family: var(--font-body); }
	.intro { display: flex; flex-direction: column; padding: 38px clamp(36px, 5vw, 76px); color: #f1f3ec; background: #171916; }
	.brand { display: flex; align-items: center; gap: 11px; }
	.brand > span { width: 36px; height: 30px; display: grid; place-items: center; color: #171916; background: var(--action-primary); border: 1px solid var(--action-primary-border); border-radius: var(--radius-control); }
	.brand div { display: grid; line-height: 1; }
	.brand strong { font-size: 15px; }
	.brand small { margin-top: 5px; color: #8f9389; font-size: 10px; letter-spacing: .04em; }
	.intro-copy { margin-top: clamp(78px, 14vh, 140px); }
	.step { display: inline-block; padding-bottom: 4px; color: #c8cbc2; border-bottom: 3px solid var(--action-primary); font-family: var(--font-data); font-size: 10px; letter-spacing: .04em; text-transform: uppercase; }
	.intro h1 { max-width: 560px; margin: 22px 0 16px; font-family: var(--font-display); font-size: clamp(34px, 3.5vw, 46px); line-height: 1.08; letter-spacing: -.04em; }
	.intro-copy > p { max-width: 500px; margin: 0; color: #a7aba2; font-size: 14px; line-height: 1.7; }
	.features { display: grid; margin-top: auto; border-top: 1px solid #3a3d38; }
	.features p { display: grid; grid-template-columns: 120px 1fr; gap: 14px; margin: 0; padding: 11px 0; border-bottom: 1px solid #3a3d38; }
	.features strong { color: #e0e2dc; font-size: 12px; }
	.features small { color: #8d9188; font-size: 11px; line-height: 1.45; }
	.setup-panel { display: grid; place-items: center; padding: 45px clamp(28px, 7vw, 110px); background: var(--surface-work); }
	.form-wrap { width: min(420px, 100%); }
	.heading { margin-bottom: 30px; }
	.admin-icon { width: 32px; height: 32px; display: grid; place-items: center; color: var(--text-primary); border-bottom: 3px solid var(--action-primary); }
	.heading h2 { margin: 19px 0 7px; color: var(--text-primary); font-family: var(--font-display); font-size: 29px; letter-spacing: -.035em; }
	.heading p { margin: 0; color: #70736c; font-size: 13px; }
	.setup-panel form { display: grid; gap: 18px; }
	.setup-panel label { display: grid; gap: 7px; color: #41443e; font-size: 13px; font-weight: 650; }
	.field { min-height: 50px; display: flex; align-items: center; gap: 9px; padding: 0 12px; color: #777a73; background: #fffefa; border: 1px solid #bfc0b7; border-radius: 2px; }
	.field:focus-within { color: var(--text-primary); border-color: var(--text-primary); outline: 2px solid var(--focus-ring); outline-offset: 1px; }
	.field input { min-width: 0; flex: 1; height: 47px; color: #20221f; background: transparent; border: 0; outline: 0; font-size: 14px; }
	.field button { display: grid; place-items: center; padding: 5px; color: #777a73; background: transparent; border: 0; cursor: pointer; }
	.strength { display: grid; grid-template-columns: repeat(3, 1fr) auto; align-items: center; gap: 5px; }
	.strength i { height: 3px; background: #d5d4cc; }
	.strength i.on { background: #167347; }
	.strength small { margin-left: 4px; color: #777a73; font-size: 11px; font-weight: 500; }
	.notice { display: flex; align-items: flex-start; gap: 9px; padding: 12px 0; color: #355541; border-top: 1px solid #82a58f; border-bottom: 1px solid #82a58f; }
	.notice p { display: grid; gap: 3px; margin: 0; }
	.notice strong { font-size: 12px; }
	.notice span { color: #5f7165; font-size: 11px; line-height: 1.5; }
	.submit { min-height: 50px; display: flex; align-items: center; justify-content: center; gap: 9px; color: var(--text-primary); background: var(--action-primary); border: 1px solid var(--action-primary-border); border-radius: var(--radius-control); cursor: pointer; font-size: 13px; font-weight: 720; }
	.submit:hover { background: var(--action-primary-hover); }
	.submit:disabled { opacity: .55; cursor: not-allowed; }
	.error { display: flex; align-items: flex-start; gap: 8px; padding: 11px 0; color: #b42318; border-bottom: 1px solid #d99a92; font-size: 12px; }
	@media (max-width: 850px) {
		.setup-shell { grid-template-columns: 1fr; background: #f5f3ec; }
		.intro { min-height: auto; padding: 24px; }
		.intro-copy { margin-top: 45px; }
		.intro h1 { font-size: 34px; }
		.features { display: none; }
		.setup-panel { min-height: 650px; align-content: center; padding-block: 45px; }
	}
</style>
