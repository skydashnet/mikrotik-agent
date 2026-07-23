<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	let { form } = $props();
	let showPassword = $state(false);
	let submitting = $state(false);
</script>

<svelte:head><title>Masuk · MikroTik Manager</title></svelte:head>

<main class="auth-shell">
	<section class="brand-panel">
		<div class="brand"><span><Icon name="router" size={23} strokeWidth={2} /></span><div><strong>MikroTik</strong><small>Manager</small></div></div>
		<div class="hero-copy">
			<div class="kicker"><i></i> Ruang operasi jaringan</div>
			<h1>Kontrol jaringan.<br/><em>Lebih tenang.</em></h1>
			<p>Satu ruang kerja untuk memantau router, memeriksa konfigurasi, dan berdiskusi dengan asisten RouterOS.</p>
		</div>
		<div class="network-art" aria-hidden="true">
			<div class="glow"></div><span class="line l1"></span><span class="line l2"></span><span class="line l3"></span>
			<div class="node main"><Icon name="router" size={29} /></div><div class="node n1"><Icon name="wifi" size={19} /></div><div class="node n2"><Icon name="server" size={19} /></div><div class="node n3"><Icon name="shield" size={19} /></div>
		</div>
		<div class="trust"><Icon name="shield" size={16} /><span><strong>Kredensial tetap terenkripsi</strong><small>AES-256-GCM saat disimpan</small></span></div>
	</section>

	<section class="form-panel">
		<div class="mobile-brand"><span><Icon name="router" size={21} /></span><strong>MikroTik Manager</strong></div>
		<div class="form-wrap">
			<div class="form-heading"><div class="welcome-icon"><Icon name="lock" size={22} /></div><h2>Selamat datang kembali</h2><p>Masuk untuk melanjutkan ke ruang kerja jaringan.</p></div>
			<form method="POST" use:enhance={() => { submitting = true; return async ({ update }) => { await update(); submitting = false; }; }}>
				{#if form?.error}<div class="error"><Icon name="alert" size={17} /><span>{form.error}</span></div>{/if}
				<label><span>Email</span><div class="field"><Icon name="mail" size={17} /><input name="email" type="email" value={form?.email ?? ''} required autocomplete="email" placeholder="admin@network.local" /></div></label>
				<label><span>Password</span><div class="field"><Icon name="key" size={17} /><input name="password" type={showPassword ? 'text' : 'password'} required autocomplete="current-password" placeholder="Masukkan password" /><button type="button" aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'} onclick={() => (showPassword = !showPassword)}><Icon name={showPassword ? 'eye-off' : 'eye'} size={17} /></button></div></label>
				<button class="submit" type="submit" disabled={submitting}>{submitting ? 'Memverifikasi…' : 'Masuk'}<Icon name="arrow-right" size={17} /></button>
			</form>
			<p class="privacy"><Icon name="shield" size={14} /> Sesi dilindungi cookie HTTP-only.</p>
		</div>
	</section>
</main>

<style>
	.auth-shell { min-height: 100vh; display: grid; grid-template-columns: minmax(390px, .9fr) minmax(450px, 1.1fr); }
	.brand-panel { position: relative; overflow: hidden; display: flex; flex-direction: column; padding: 38px clamp(38px, 5vw, 76px); color: white; background: radial-gradient(circle at 76% 46%, rgba(14,165,233,.16), transparent 30%), radial-gradient(circle at 10% 92%, rgba(20,184,166,.1), transparent 32%), #07111f; }
	.brand-panel::after { content: ''; position: absolute; inset: 0; opacity: .18; background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px); background-size: 32px 32px; mask-image: linear-gradient(to bottom, black, transparent 78%); }
	.brand { position: relative; z-index: 2; display: flex; align-items: center; gap: 11px; }.brand > span, .mobile-brand span { width: 42px; height: 42px; display: grid; place-items: center; color: #07111f; background: linear-gradient(145deg, #67e8f9, #2dd4bf); border-radius: 12px; }.brand div { display: grid; line-height: 1; }.brand strong { font-size: 15px; }.brand small { margin-top: 5px; color: #8290a3; font-size: 10px; letter-spacing: .17em; text-transform: uppercase; }
	.hero-copy { position: relative; z-index: 2; margin-top: clamp(70px, 12vh, 125px); }.kicker { display: flex; align-items: center; gap: 9px; color: #67e8f9; font-size: 9px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }.kicker i { width: 22px; height: 2px; background: #2dd4bf; }.hero-copy h1 { margin: 17px 0; font-size: clamp(38px, 4.4vw, 62px); line-height: 1.02; letter-spacing: -.055em; }.hero-copy h1 em { color: #5eead4; font-style: normal; }.hero-copy p { max-width: 480px; margin: 0; color: #8fa0b4; font-size: 12px; line-height: 1.75; }
	.network-art { position: relative; z-index: 2; width: 310px; height: 155px; margin: 38px auto 10px; }.glow { position: absolute; inset: 20px 75px; background: #0ea5e9; filter: blur(55px); opacity: .18; }.node { position: absolute; z-index: 2; display: grid; place-items: center; color: #70e2f2; background: #0d2237; border: 1px solid #1e4660; border-radius: 13px; box-shadow: 0 8px 30px rgba(0,0,0,.25); }.node.main { left: 126px; top: 48px; width: 60px; height: 60px; color: #07111f; background: linear-gradient(145deg, #67e8f9, #2dd4bf); border: 0; border-radius: 18px; }.node.n1 { left: 5px; top: 9px; width: 43px; height: 43px; }.node.n2 { right: 3px; top: 8px; width: 43px; height: 43px; }.node.n3 { right: 19px; bottom: 1px; width: 43px; height: 43px; }.line { position: absolute; z-index: 1; height: 1px; background: linear-gradient(90deg, #1d4f69, #2dd4bf, #1d4f69); transform-origin: left; }.l1 { width: 120px; left: 42px; top: 38px; transform: rotate(24deg); }.l2 { width: 120px; left: 176px; top: 75px; transform: rotate(-30deg); }.l3 { width: 105px; left: 174px; top: 91px; transform: rotate(25deg); }
	.trust { position: relative; z-index: 2; display: flex; align-items: center; gap: 9px; margin-top: auto; color: #5eead4; }.trust span { display: grid; gap: 2px; }.trust strong { color: #a8b6c6; font-size: 9px; }.trust small { color: #526276; font-size: 8px; }
	.form-panel { display: grid; place-items: center; padding: 50px clamp(28px, 7vw, 110px); background: #f8fafc; border-radius: 28px 0 0 28px; }.form-wrap { width: min(390px, 100%); }.form-heading { margin-bottom: 28px; }.welcome-icon { width: 44px; height: 44px; display: grid; place-items: center; color: #2563eb; background: #eff6ff; border: 1px solid #dbeafe; border-radius: 13px; }.form-heading h2 { margin: 17px 0 7px; color: #101828; font-size: 26px; letter-spacing: -.035em; }.form-heading p { margin: 0; color: #7b8798; font-size: 11px; }.form-panel form { display: grid; gap: 17px; }.form-panel label { display: grid; gap: 7px; color: #344054; font-size: 10px; font-weight: 700; }.field { min-height: 46px; display: flex; align-items: center; gap: 9px; padding: 0 12px; color: #98a2b3; background: white; border: 1px solid #d8dee6; border-radius: 11px; transition: .18s; }.field:focus-within { color: #2563eb; border-color: #60a5fa; box-shadow: 0 0 0 3px #dbeafe80; }.field input { min-width: 0; flex: 1; height: 43px; color: #1d2939; background: transparent; border: 0; outline: 0; font-size: 11px; }.field input::placeholder { color: #b0b8c4; }.field button { display: grid; place-items: center; padding: 5px; color: #98a2b3; background: transparent; border: 0; border-radius: 6px; cursor: pointer; }.submit { min-height: 47px; display: flex; align-items: center; justify-content: center; gap: 9px; margin-top: 5px; color: white; background: linear-gradient(135deg, #2563eb, #1d4ed8); border: 0; border-radius: 11px; box-shadow: 0 9px 22px rgba(37,99,235,.2); cursor: pointer; font-size: 11px; font-weight: 750; }.submit:disabled { opacity: .65; cursor: wait; }.error { display: flex; align-items: flex-start; gap: 8px; padding: 11px; color: #b42318; background: #fff1f0; border: 1px solid #fee4e2; border-radius: 10px; font-size: 10px; line-height: 1.45; }.privacy { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 25px 0 0; color: #98a2b3; font-size: 9px; }.mobile-brand { display: none; }
	@media (max-width: 850px) { .auth-shell { grid-template-columns: 1fr; background: #f8fafc; }.brand-panel { display: none; }.form-panel { min-height: 100vh; align-content: center; border-radius: 0; }.mobile-brand { position: absolute; top: 22px; left: 24px; display: flex; align-items: center; gap: 9px; color: #172033; font-size: 12px; }.mobile-brand span { width: 34px; height: 34px; border-radius: 10px; }.form-wrap { padding-top: 28px; } }
</style>
