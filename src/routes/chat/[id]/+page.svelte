<script lang="ts">
	import { tick, onDestroy } from 'svelte';
	import { goto, invalidateAll, replaceState } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import LottieAnimation from '$lib/components/LottieAnimation.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import { parseSseFrame } from '$lib/sse';
	let { data } = $props();

	interface Msg { role: 'user' | 'assistant'; content: string; attachments?: Array<{ name: string; url: string }> }
	interface SelectedImage { name: string; type: string; data: string; url: string; size: number }
	const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
	const maxImageBytes = 5 * 1024 * 1024;
	const maxTotalImageBytes = 12 * 1024 * 1024;
	let loadedSessionId: number | null | undefined;
	let messages = $state<Msg[]>([]);
	let input = $state('');
	let streaming = $state(false);
	let toolNote = $state('');
	let sessionId = $state<number | null>(null);
	let errorNote = $state('');
	let messagesEl = $state<HTMLDivElement>();
	let imageInput = $state<HTMLInputElement>();
	let selectedImages = $state<SelectedImage[]>([]);
	let addingImages = $state(false);
	let dragActive = $state(false);
	let dragDepth = 0;
	let undoing = $state(false);
	let deletingSessionId = $state<number | null>(null);
	let mobileHistoryOpen = $state(false);
	let aborter: AbortController | null = null;
	let imageImportQueue = Promise.resolve();

	$effect(() => {
		const nextSessionId = data.selectedSessionId;
		const nextMessages = data.messages;
		if (loadedSessionId !== nextSessionId) {
			messages = nextMessages.map((message) => ({ ...message }));
			sessionId = nextSessionId;
			loadedSessionId = nextSessionId;
			errorNote = '';
			toolNote = '';
			void scrollToBottom(false);
		}
	});

	onDestroy(() => aborter?.abort());

	async function scrollToBottom(smooth = true) {
		await tick();
		messagesEl?.scrollTo({ top: messagesEl.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
	}

	function newConversation() {
		if (streaming) return;
		mobileHistoryOpen = false;
		messages = [];
		sessionId = null;
		loadedSessionId = undefined;
		errorNote = '';
		input = '';
		selectedImages = [];
		void goto(`/chat/${data.router.id}`, { replaceState: true, noScroll: true, keepFocus: true });
	}

	function readAsDataUrl(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result));
			reader.onerror = () => reject(new Error(`Gagal membaca ${file.name}.`));
			reader.readAsDataURL(file);
		});
	}

	async function addImages(files: File[]) {
		if (!files.length) return;
		addingImages = true;
		errorNote = '';
		try {
			for (const [index, file] of files.entries()) {
				const name = file.name.trim() || `gambar-${Date.now()}-${index + 1}`;
				if (selectedImages.length >= 4) { errorNote = 'Maksimal 4 gambar per pesan.'; break; }
				if (!allowedImageTypes.has(file.type)) { errorNote = `${name}: format harus JPG, PNG, WebP, atau GIF.`; continue; }
				if (file.size > maxImageBytes) { errorNote = `${name}: ukuran maksimal 5 MB.`; continue; }
				if (selectedImages.reduce((sum, image) => sum + image.size, 0) + file.size > maxTotalImageBytes) {
					errorNote = 'Total ukuran gambar maksimal 12 MB.';
					break;
				}
				try {
					const url = await readAsDataUrl(file);
					selectedImages.push({ name, type: file.type, size: file.size, url, data: url.split(',')[1] ?? '' });
				} catch (readError) {
					errorNote = (readError as Error).message;
				}
			}
		} finally {
			addingImages = false;
		}
	}

	function queueImages(files: File[]) {
		imageImportQueue = imageImportQueue
			.then(() => addImages(files))
			.catch((error) => {
				addingImages = false;
				errorNote = error instanceof Error ? error.message : 'Gambar gagal ditambahkan.';
			});
		return imageImportQueue;
	}

	function selectImages(event: Event) {
		const inputEl = event.currentTarget as HTMLInputElement;
		const files = [...(inputEl.files ?? [])];
		inputEl.value = '';
		void queueImages(files);
	}

	function hasDraggedFiles(event: DragEvent) {
		const transfer = event.dataTransfer;
		return !!transfer && ([...transfer.types].includes('Files') || [...transfer.items].some((item) => item.kind === 'file'));
	}

	function onDragEnter(event: DragEvent) {
		if (!hasDraggedFiles(event)) return;
		event.preventDefault();
		dragDepth += 1;
		if (data.aiReady && !streaming) dragActive = true;
	}

	function onDragOver(event: DragEvent) {
		if (!hasDraggedFiles(event)) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = data.aiReady && !streaming ? 'copy' : 'none';
	}

	function onDragLeave(event: DragEvent) {
		if (dragDepth === 0) return;
		event.preventDefault();
		dragDepth = Math.max(0, dragDepth - 1);
		if (dragDepth === 0) dragActive = false;
	}

	function onDrop(event: DragEvent) {
		if (!hasDraggedFiles(event)) return;
		event.preventDefault();
		dragDepth = 0;
		dragActive = false;
		if (!data.aiReady) { errorNote = 'Konfigurasikan AI sebelum menambahkan gambar.'; return; }
		if (streaming) { errorNote = 'Tunggu respons selesai sebelum menambahkan gambar.'; return; }
		void queueImages([...(event.dataTransfer?.files ?? [])]);
	}

	function onPaste(event: ClipboardEvent) {
		const files = [...(event.clipboardData?.items ?? [])]
			.filter((item) => item.kind === 'file')
			.map((item) => item.getAsFile())
			.filter((file): file is File => file !== null);
		if (!files.length) return;
		event.preventDefault();
		if (!data.aiReady) { errorNote = 'Konfigurasikan AI sebelum menambahkan gambar.'; return; }
		if (streaming) { errorNote = 'Tunggu respons selesai sebelum menambahkan gambar.'; return; }
		void queueImages(files);
	}

	function removeImage(index: number) {
		selectedImages.splice(index, 1);
	}

	async function send() {
		const typedText = input.trim();
		if ((!typedText && selectedImages.length === 0) || streaming || !data.aiReady) return;
		const text = typedText || 'Analisis gambar ini dan jelaskan temuan pentingnya.';
		const outgoingImages = selectedImages.map((image) => ({ ...image }));
		input = '';
		selectedImages = [];
		errorNote = '';
		messages.push({
			role: 'user',
			content: text,
			attachments: outgoingImages.map((image) => ({ name: image.name, url: image.url }))
		}, { role: 'assistant', content: '' });
		const assistantIdx = messages.length - 1;
		streaming = true;
		toolNote = '';
		aborter = new AbortController();
		await scrollToBottom();
		let streamRollback = false;
		let rollbackDeletedSession = false;

		try {
			const res = await fetch('/api/chat', {
				method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: aborter.signal,
				body: JSON.stringify({
					sessionId,
					routerId: Number(data.router.id),
					message: typedText,
					images: outgoingImages.map(({ name, type, data: imageData }) => ({ name, type, data: imageData }))
				})
			});
			if (!res.ok || !res.body) throw new Error((await res.text().catch(() => '')) || `HTTP ${res.status}`);

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			let streamError = '';
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				buffer = buffer.replace(/\r\n/g, '\n');
				const frames = buffer.split('\n\n');
				buffer = frames.pop() ?? '';
				for (const rawFrame of frames) {
					const frame = parseSseFrame<Record<string, unknown>>(rawFrame);
					if (!frame) continue;
					const payload = frame.data;
					if (frame.event === 'session' && typeof payload.sessionId === 'number') {
						sessionId = payload.sessionId;
							replaceState(`/chat/${data.router.id}?session=${payload.sessionId}`, {});
					} else if (frame.event === 'token' && typeof payload.value === 'string') {
						messages[assistantIdx].content += payload.value;
						await scrollToBottom(false);
					} else if (frame.event === 'tool') {
						toolNote = payload.phase === 'tool_start' ? `Membaca data melalui ${String(payload.name ?? 'tool')}…` : '';
					} else if (frame.event === 'error') {
						streamError = String(payload.message ?? 'Respons AI terputus.');
						streamRollback = payload.rollback === true;
						rollbackDeletedSession = payload.sessionDeleted === true;
					}
				}
			}
			if (streamError) throw new Error(streamError);
			if (!messages[assistantIdx].content) messages[assistantIdx].content = 'Tidak ada respons teks dari model.';
			// The session is created inside the streaming request. Refresh route data
			// after persistence so the new session immediately appears in history.
			loadedSessionId = undefined;
			await invalidateAll();
		} catch (error) {
			if (aborter?.signal.aborted) {
				errorNote = 'Respons dihentikan.';
			} else {
				errorNote = error instanceof Error ? error.message : 'Percakapan terputus.';
			}
			if (streamRollback) {
				messages.splice(Math.max(0, assistantIdx - 1), 2);
				if (!input.trim()) input = typedText;
				selectedImages = outgoingImages;
				if (rollbackDeletedSession) {
					sessionId = null;
					loadedSessionId = undefined;
					replaceState(`/chat/${data.router.id}`, {});
				}
			} else if (!messages[assistantIdx]?.content) messages.pop();
		} finally {
			streaming = false;
			toolNote = '';
			aborter = null;
			await scrollToBottom();
		}
	}

	async function undoLastTurn() {
		if (!sessionId || streaming || undoing || !messages.some((message) => message.role === 'user')) return;
		undoing = true;
		errorNote = '';
		try {
			const response = await fetch('/api/chat', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sessionId })
			});
			if (!response.ok) throw new Error((await response.text().catch(() => '')) || `HTTP ${response.status}`);
			const result = await response.json() as { message?: string; sessionDeleted?: boolean };
			const lastUserIndex = messages.findLastIndex((message) => message.role === 'user');
			if (lastUserIndex >= 0) messages.splice(lastUserIndex);
			if (!input.trim() && result.message) input = result.message;
			if (result.sessionDeleted) {
				sessionId = null;
				loadedSessionId = undefined;
				replaceState(`/chat/${data.router.id}`, {});
			}
			await invalidateAll();
		} catch {
			errorNote = 'Pesan terakhir gagal diurungkan. Silakan coba lagi.';
		} finally {
			undoing = false;
			await scrollToBottom(false);
		}
	}

	async function deleteSession(id: number, title: string | null) {
		if (streaming || deletingSessionId !== null) return;
		if (!confirm(`Hapus sesi “${title || 'Percakapan RouterOS'}” beserta seluruh pesannya?`)) return;
		deletingSessionId = id;
		errorNote = '';
		try {
			const response = await fetch(`/api/chat/sessions/${id}`, { method: 'DELETE' });
			if (!response.ok) throw new Error();
			if (sessionId === id) {
				messages = [];
				sessionId = null;
				loadedSessionId = undefined;
				replaceState(`/chat/${data.router.id}`, {});
			}
			await invalidateAll();
		} catch {
			errorNote = 'Sesi chat gagal dihapus. Silakan coba lagi.';
		} finally {
			deletingSessionId = null;
		}
	}

	function stop() { aborter?.abort(); }
	function onKey(e: KeyboardEvent) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }
	function onWindowKeydown(e: KeyboardEvent) { if (e.key === 'Escape') mobileHistoryOpen = false; }
	function formatDate(value: string | Date) {
		return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

<svelte:head><title>{data.router.name} AI · MikroTik Manager</title></svelte:head>

<div class="chat-page">
	<header class="chat-head">
		<div class="router-title"><a href="/" aria-label="Kembali ke perangkat"><Icon name="arrow-left" size={19} /></a><span class="device"><Icon name="router" size={23} /></span><div><div><h1>{data.router.name}</h1><span class="live"><Icon name="shield" size={12} /> Analisis hanya-baca</span></div><p>{data.router.host} <b>·</b> {data.model ?? 'AI belum dikonfigurasi'}</p></div></div>
		<div class="chat-actions">
			<button class="mobile-history-toggle" onclick={() => (mobileHistoryOpen = true)} disabled={streaming} aria-label="Buka riwayat percakapan"><Icon name="clock" size={17} /> Riwayat</button>
			<button class="undo-top" onclick={undoLastTurn} disabled={!sessionId || streaming || undoing || !messages.some((message) => message.role === 'user')} title="Hapus putaran chat terakhir dan kembalikan prompt ke kotak input"><Icon name="undo" size={16} /> {undoing ? 'Mengurungkan…' : 'Urungkan terakhir'}</button>
			<button class="new-top" onclick={newConversation} disabled={streaming}><Icon name="plus" size={17} /> Percakapan baru</button>
		</div>
	</header>

	{#if !data.aiReady}
		<div class="setup-alert"><span><Icon name="alert" size={19} /></span><div><strong>Asisten AI belum siap</strong><p>Lengkapi endpoint, API key, dan model aktif sebelum memulai percakapan.</p></div><a href="/settings">Buka pengaturan <Icon name="arrow-right" size={16} /></a></div>
	{/if}

	<div class="chat-shell">
		{#if mobileHistoryOpen}<button class="history-scrim" aria-label="Tutup riwayat" onclick={() => (mobileHistoryOpen = false)}></button>{/if}
		<aside class:open={mobileHistoryOpen} class="history-panel" aria-label="Riwayat percakapan">
			<div class="history-head"><span>Sesi pemeriksaan</span><div><button class="history-close" onclick={() => (mobileHistoryOpen = false)} aria-label="Tutup riwayat"><Icon name="x" size={16} /></button><button onclick={newConversation} disabled={streaming} aria-label="Percakapan baru"><Icon name="plus" size={17} /></button></div></div>
			{#if data.sessions.length}
				<nav aria-label="Riwayat percakapan">{#each data.sessions as session (session.id)}<div class="history-item"><a href={`/chat/${data.router.id}?session=${session.id}`} class:active={sessionId === session.id} class:disabled={streaming} onclick={(event) => { if (streaming) event.preventDefault(); else mobileHistoryOpen = false; }}><Icon name="message" size={15} /><span><strong>{session.title || 'Percakapan RouterOS'}</strong><small>{formatDate(session.created_at)}</small></span></a><button class="history-delete" onclick={() => deleteSession(Number(session.id), session.title)} disabled={streaming || deletingSessionId !== null} aria-label={`Hapus ${session.title || 'sesi chat'}`} title="Hapus sesi"><Icon name="trash" size={14} /></button></div>{/each}</nav>
			{:else}<div class="no-history"><Icon name="clock" size={19} /><strong>Belum ada sesi tersimpan</strong><span>Kirim pesan pertama untuk membuat riwayat pemeriksaan router ini.</span></div>{/if}
			<div class="context"><span><Icon name="shield" size={14} /> Cakupan aktif</span><strong>{data.router.name}</strong><small>Memori aktif · tool hanya-baca</small></div>
		</aside>

		<section class="conversation" aria-label="Percakapan dan lampiran gambar" ondragenter={onDragEnter} ondragover={onDragOver} ondragleave={onDragLeave} ondrop={onDrop}>
			{#if dragActive}<div class="drop-target" aria-live="polite"><Icon name="image" size={21} /><strong>Lepaskan gambar di sini</strong><span>JPG, PNG, WebP, atau GIF</span></div>{/if}
			<div class="messages" bind:this={messagesEl} aria-live="polite">
				{#if messages.length === 0}
					<div class="welcome">
						<div class="welcome-robot"><LottieAnimation src="/animations/robot-welcome.lottie" speed={0.85} /></div>
						<h2>Apa yang perlu diperiksa?</h2>
						<p>Tanyakan kondisi live, kirim screenshot, atau pilih pemeriksaan awal. Setiap akses ke RouterOS tetap hanya-baca.</p>
						<div class="prompts">
							<button onclick={() => { input = 'Periksa resource router dan jelaskan kondisi kesehatannya.'; send(); }} disabled={!data.aiReady}><span><strong>Cek kesehatan router</strong><small>CPU, memori, dan waktu aktif</small></span><Icon name="arrow-right" size={15} /></button>
							<button onclick={() => { input = 'Audit konfigurasi firewall filter dan tunjukkan risiko utamanya.'; send(); }} disabled={!data.aiReady}><span><strong>Audit aturan firewall</strong><small>Filter, urutan aturan, dan paparan</small></span><Icon name="arrow-right" size={15} /></button>
							<button onclick={() => { input = 'Tampilkan interface dan jelaskan status link yang perlu diperhatikan.'; send(); }} disabled={!data.aiReady}><span><strong>Baca status interface</strong><small>Link, trafik, dan error counter</small></span><Icon name="arrow-right" size={15} /></button>
						</div>
					</div>
				{:else}
					{#each messages as message, index (`${message.role}-${index}`)}
						<div class="message {message.role}">
							<div class="message-profile {message.role}" class:processing={message.role === 'assistant' && streaming && index === messages.length - 1} aria-hidden="true">
								{#if message.role === 'assistant'}
									<LottieAnimation
										src={streaming && index === messages.length - 1 ? '/animations/robot-thinking.lottie' : '/animations/ai-profile.lottie'}
										speed={0.9}
										autoplay={index === messages.length - 1}
										loop={index === messages.length - 1}
									/>
								{:else}
									<img src="/avatars/network-operator.svg" alt="" />
								{/if}
							</div>
							<div class="message-body">
								<span>{message.role === 'assistant' ? 'Asisten RouterOS' : 'Anda'}</span>
								<div class="bubble">
									{#if message.attachments?.length}<div class="message-images">{#each message.attachments as attachment}<a href={attachment.url} target="_blank" rel="noreferrer" aria-label={`Buka ${attachment.name}`}><img src={attachment.url} alt={attachment.name} /></a>{/each}</div>{/if}
									{#if message.role === 'assistant' && streaming && index === messages.length - 1 && !message.content}
										<span class="thinking" aria-label="AI sedang berpikir"><strong>Sedang berpikir</strong><i></i><i></i><i></i></span>
									{:else if message.role === 'assistant'}
										<Markdown content={message.content || '…'} />{#if streaming && index === messages.length - 1}<i class="typing-cursor" aria-hidden="true"></i>{/if}
									{:else}
										{message.content || '…'}
									{/if}
								</div>
							</div>
						</div>
					{/each}
				{/if}
				{#if toolNote}<div class="tool-note"><i></i><Icon name="activity" size={15} /> {toolNote}</div>{/if}
				{#if errorNote}<div class="error-note"><Icon name="alert" size={16} />{errorNote}<button onclick={() => (errorNote = '')}><Icon name="x" size={14} /></button></div>{/if}
			</div>

			<div class="composer-wrap">
				{#if selectedImages.length}<div class="image-queue">{#each selectedImages as image, index}<div><img src={image.url} alt={image.name} /><button onclick={() => removeImage(index)} aria-label={`Hapus ${image.name}`}><Icon name="x" size={12} /></button><span>{image.name}</span></div>{/each}</div>{/if}
				<input class="image-input" bind:this={imageInput} type="file" aria-label="Pilih gambar untuk dianalisis" accept="image/jpeg,image/png,image/webp,image/gif" multiple onchange={selectImages} />
				<div class="composer" class:disabled={!data.aiReady}><button class="attach" onclick={() => imageInput?.click()} disabled={!data.aiReady || streaming || addingImages || selectedImages.length >= 4} aria-label="Tambahkan gambar"><Icon name="image" size={18} /></button><textarea bind:value={input} onkeydown={onKey} onpaste={onPaste} aria-label="Pesan untuk asisten RouterOS" placeholder={data.aiReady ? 'Tanya atau kirim gambar untuk dianalisis…' : 'Konfigurasikan AI terlebih dahulu'} disabled={!data.aiReady} rows="1" maxlength="12000"></textarea>{#if streaming}<button class="stop" onclick={stop} aria-label="Hentikan respons"><i></i></button>{:else}<button class="send" onclick={send} disabled={!data.aiReady || addingImages || (!input.trim() && selectedImages.length === 0)} aria-label="Kirim pesan"><Icon name="send" size={18} /></button>{/if}</div>
				<div class="composer-meta"><span><Icon name="shield" size={13} /> Mode hanya-baca</span><small>Enter kirim · Shift+Enter baris baru · Tempel atau jatuhkan gambar</small></div>
			</div>
		</section>
	</div>
</div>

<style>
	.chat-page { max-width: 1320px; height: calc(100vh - 72px); min-height: 650px; margin: 0 auto; display: flex; flex-direction: column; }
	.chat-head { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 16px; }
	.router-title { min-width: 0; display: flex; align-items: center; gap: 11px; }
	.router-title > a { width: 38px; height: 38px; display: grid; place-items: center; color: var(--text-secondary); background: transparent; border: 1px solid var(--border-strong); border-radius: var(--radius-control); }
	.device { width: 30px; height: 30px; display: grid; place-items: center; color: var(--text-primary); border-bottom: 3px solid var(--action-primary); }
	.router-title > div:last-child { min-width: 0; display: grid; gap: 4px; }
	.router-title > div:last-child > div { display: flex; align-items: center; gap: 9px; }
	.router-title h1 { overflow: hidden; margin: 0; color: var(--text-primary); font-size: 17px; text-overflow: ellipsis; white-space: nowrap; }
	.router-title p { overflow: hidden; margin: 0; color: var(--text-tertiary); font-family: var(--font-data); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
	.router-title p b { padding: 0 4px; color: #a3a59d; }
	.live { display: inline-flex; align-items: center; gap: 4px; color: var(--status-success); font-size: 10px; font-weight: 650; white-space: nowrap; }
	.chat-actions { display: flex; align-items: center; gap: 7px; }
	.new-top, .undo-top, .mobile-history-toggle { min-height: 40px; display: inline-flex; align-items: center; gap: 7px; padding: 0 13px; color: var(--text-secondary); background: var(--surface-base); border: 1px solid var(--border-strong); border-radius: var(--radius-control); cursor: pointer; font-size: 12px; font-weight: 650; }
	.new-top:hover, .undo-top:hover:not(:disabled) { color: #171916; background: #e9e8e1; border-color: #96988f; }
	.new-top:disabled, .undo-top:disabled { opacity: .4; cursor: not-allowed; }
	.mobile-history-toggle { display: none; }
	.setup-alert { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; padding: 11px 13px; color: #6b5716; background: #fff9dc; border: 1px solid #c7b564; border-radius: 2px; }
	.setup-alert > span { display: grid; place-items: center; }
	.setup-alert div { display: grid; gap: 2px; }
	.setup-alert strong { font-size: 12px; }
	.setup-alert p { margin: 0; color: #786b3e; font-size: 11px; }
	.setup-alert a { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; color: #4b421d; font-size: 11px; font-weight: 700; text-decoration: none; }

	.chat-shell { position: relative; min-height: 0; flex: 1; display: grid; grid-template-columns: 260px minmax(0, 1fr); background: var(--surface-base); border: 1px solid var(--border-default); border-radius: var(--radius-panel); overflow: hidden; }
	.history-panel { min-height: 0; display: flex; flex-direction: column; padding: 18px 12px 14px; background: var(--surface-subtle); border-right: 1px solid var(--border-default); }
	.history-head { display: flex; align-items: center; justify-content: space-between; padding: 0 7px 13px; }
	.history-head span { color: var(--text-secondary); font-family: var(--font-data); font-size: 10px; font-weight: 700; letter-spacing: .035em; text-transform: uppercase; }
	.history-head > div { display: flex; gap: 4px; }
	.history-head button { width: 30px; height: 30px; display: grid; place-items: center; color: var(--text-primary); background: var(--action-primary); border: 1px solid var(--action-primary-border); border-radius: var(--radius-control); cursor: pointer; }
	.history-head .history-close { display: none; color: var(--text-secondary); background: transparent; border-color: transparent; }
	.history-panel nav { display: grid; overflow-y: auto; }
	.history-item { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) 28px; align-items: center; gap: 2px; border-top: 1px solid #d7d6ce; }
	.history-item:last-child { border-bottom: 1px solid #d7d6ce; }
	.history-panel nav a { min-width: 0; display: flex; align-items: center; gap: 8px; padding: 11px 7px; color: #666962; text-decoration: none; }
	.history-panel nav a:hover { color: #171916; background: #e5e4dc; }
	.history-panel nav a.active { color: var(--text-primary); background: var(--surface-base); box-shadow: inset 3px 0 0 var(--action-primary); }
	.history-panel nav a.disabled { opacity: .5; pointer-events: none; }
	.history-panel nav a > span { min-width: 0; display: grid; gap: 3px; }
	.history-panel nav strong { overflow: hidden; font-size: 12px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
	.history-panel nav small { color: #858880; font-size: 10px; }
	.history-delete { width: 28px; height: 28px; display: grid; place-items: center; padding: 0; color: #8c5a54; background: transparent; border: 0; border-radius: 2px; cursor: pointer; }
	.history-delete:hover:not(:disabled) { color: #b42318; background: #f5dfdb; }
	.history-delete:disabled { opacity: .35; cursor: not-allowed; }
	.no-history { display: grid; justify-items: start; gap: 5px; padding: 26px 7px; color: var(--text-tertiary); font-size: 11px; line-height: 1.45; }
	.no-history strong { color: var(--text-secondary); font-size: 11px; }
	.context { display: grid; gap: 5px; margin-top: auto; padding: 14px 7px 2px; border-top: 1px solid #aeb0a7; }
	.context span { display: flex; align-items: center; gap: 5px; color: #167347; font-size: 10px; font-weight: 650; }
	.context strong { overflow: hidden; color: #343731; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
	.context small { color: #777a73; font-size: 10px; }

	.conversation { position: relative; min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--surface-base); }
	.drop-target { position: absolute; z-index: 5; inset: 12px; display: grid; place-content: center; justify-items: center; gap: 5px; color: #292c27; background: rgba(255, 254, 250, .96); border: 2px dashed #899d20; border-radius: 2px; pointer-events: none; }
	.drop-target strong { font-size: 14px; }
	.drop-target span { color: #6f726a; font-size: 11px; }
	.messages { min-height: 0; flex: 1; overflow-y: auto; padding: 30px clamp(26px, 5vw, 72px); scroll-behavior: smooth; }
	.welcome { width: min(720px, 100%); margin: 0 auto; padding-top: clamp(38px, 9vh, 90px); text-align: left; }
	.welcome-robot { width: 70px; height: 70px; margin: 0 0 12px -5px; }
	.welcome h2 { margin: 0 0 9px; color: var(--text-primary); font-family: var(--font-display); font-size: clamp(24px, 2.4vw, 30px); letter-spacing: -.03em; }
	.welcome > p { max-width: 620px; margin: 0; color: #686b64; font-size: 14px; line-height: 1.65; }
	.prompts { width: 100%; display: grid; margin-top: 28px; border-top: 1px solid #bfc0b7; }
	.prompts button { min-width: 0; min-height: 58px; display: flex; align-items: center; gap: 12px; padding: 11px 4px; color: #555851; background: transparent; border: 0; border-bottom: 1px solid #d6d5cd; cursor: pointer; text-align: left; }
	.prompts button { transition: padding-left var(--motion-fast) ease, background var(--motion-fast) ease; }
	.prompts button:hover { color: var(--text-primary); padding-left: 10px; background: var(--surface-subtle); }
	.prompts button:disabled { opacity: .45; cursor: not-allowed; }
	.prompts span { min-width: 0; flex: 1; display: grid; gap: 3px; }
	.prompts strong { color: #30332e; font-size: 13px; }
	.prompts small { color: #7b7e76; font-size: 11px; }

	.message { width: 100%; display: flex; align-items: flex-start; gap: 10px; max-width: 860px; margin: 0 auto 28px; }
	.message.user { flex-direction: row-reverse; }
	.message-profile { width: 38px; height: 38px; flex: 0 0 auto; overflow: hidden; display: grid; place-items: center; background: var(--surface-subtle); border: 1px solid var(--border-default); border-radius: 50%; }
	.message-profile.assistant { width: 62px; height: 62px; overflow: visible; margin: -11px -7px -11px -9px; background: transparent; border: 0; border-radius: 0; }
	.message-profile img { width: 100%; height: 100%; display: block; object-fit: cover; }
	.message-profile.assistant :global(canvas) { width: 68px; height: 68px; filter: saturate(2.1) contrast(1.3) brightness(.92) drop-shadow(0 2px 5px rgb(83 73 184 / .18)); }
	.message-body { min-width: 0; display: grid; gap: 7px; }
	.message.user .message-body { justify-items: end; }
	.message-body > span { color: #74776f; font-size: 11px; font-weight: 650; }
	.bubble { max-width: 740px; color: #292c27; font-size: 14px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
	.assistant .bubble { padding: 0 0 22px; border-bottom: 1px solid #dfded6; }
	.user .bubble { padding: 11px 14px; color: var(--text-primary); background: #edf4bd; border: 1px solid #c8d271; border-radius: var(--radius-control); }
	.message-images { display: grid; grid-template-columns: repeat(2, minmax(0, 220px)); gap: 8px; margin-bottom: 10px; }
	.message-images a { display: block; overflow: hidden; background: #ecebe4; border: 1px solid #cfcec6; border-radius: 2px; }
	.message-images img { width: 100%; height: 165px; display: block; object-fit: cover; }
	.tool-note, .error-note { max-width: 860px; margin: 0 auto 16px; display: flex; align-items: center; gap: 7px; padding: 9px 0; border-bottom: 1px solid currentColor; font-size: 12px; }
	.tool-note { color: #5e641f; }
	.tool-note i { width: 6px; height: 6px; background: #8a931f; border-radius: 50%; animation: pulse 1s infinite; }
	.error-note { padding: 10px 12px; color: var(--status-danger); background: var(--status-danger-surface); border: 0; border-left: 3px solid currentColor; }
	.error-note button { margin-left: auto; display: grid; place-items: center; padding: 0; color: currentColor; background: transparent; border: 0; cursor: pointer; }

	.composer-wrap { padding: 14px clamp(24px, 4vw, 58px) 12px; background: var(--surface-base); border-top: 1px solid var(--border-default); }
	.image-input { display: none; }
	.image-queue { display: flex; gap: 7px; overflow-x: auto; padding: 0 2px 9px; }
	.image-queue > div { position: relative; width: 76px; flex: 0 0 auto; }
	.image-queue img { width: 76px; height: 58px; display: block; object-fit: cover; border: 1px solid #bfc0b7; border-radius: 2px; }
	.image-queue button { position: absolute; top: -5px; right: -5px; width: 18px; height: 18px; display: grid; place-items: center; padding: 0; color: #fff; background: #b42318; border: 1px solid #fff; border-radius: 50%; cursor: pointer; }
	.image-queue span { display: block; margin-top: 3px; overflow: hidden; color: #666962; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
	.composer { min-height: 52px; display: flex; align-items: flex-end; gap: 8px; padding: 7px; background: #f7f6ef; border: 1px solid #bfc0b7; border-radius: 2px; }
	.composer:focus-within { background: var(--surface-base); border-color: var(--text-primary); outline: 2px solid var(--focus-ring); outline-offset: 1px; }
	.composer.disabled { opacity: .55; }
	.composer textarea { min-height: 32px; max-height: 120px; flex: 1; resize: none; padding: 7px 0 3px; color: #20221f; background: transparent; border: 0; outline: 0; font-family: inherit; font-size: 14px; line-height: 1.5; }
	.composer button { width: 36px; height: 36px; flex: 0 0 auto; display: grid; place-items: center; border: 0; border-radius: 2px; cursor: pointer; }
	.attach { color: #62655e; background: transparent; }
	.attach:hover { color: #171916; background: #e9e8e1; }
	.attach:disabled { opacity: .4; cursor: not-allowed; }
	.send { color: var(--text-primary); background: var(--action-primary); border: 1px solid var(--action-primary-border) !important; }
	.send:disabled { color: #9b9d95; background: #e4e3dc; border-color: #d2d1c9 !important; cursor: not-allowed; }
	.stop { background: #f1d5d1; }
	.stop i { width: 9px; height: 9px; background: #b42318; border-radius: 1px; }
	.composer-meta { display: flex; align-items: center; justify-content: space-between; padding: 7px 2px 0; color: #858880; font-size: 10px; }
	.composer-meta span { display: flex; align-items: center; gap: 4px; color: var(--status-success); }
	.thinking { min-height: 28px; display: inline-flex; align-items: center; gap: 5px; color: #555d1e; }
	.thinking strong { font-size: 12px; font-weight: 700; }
	.thinking i { width: 4px; height: 4px; background: currentColor; border-radius: 50%; animation: thinking-dot 1s ease-in-out infinite; }
	.thinking i:nth-of-type(2) { animation-delay: .14s; }
	.thinking i:nth-of-type(3) { animation-delay: .28s; }
	.typing-cursor { display: inline-block; width: 2px; height: 1em; margin-left: 3px; vertical-align: -2px; background: #68721e; animation: cursor-blink .75s steps(1) infinite; }

	@keyframes pulse { 50% { opacity: .25; } }
	@keyframes thinking-dot { 0%, 60%, 100% { opacity: .28; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-2px); } }
	@keyframes cursor-blink { 50% { opacity: 0; } }
	@media (max-width: 1000px) { .chat-shell { grid-template-columns: 215px minmax(0, 1fr); } }
	@media (max-width: 720px) {
		.chat-page { height: calc(100vh - 98px); min-height: 610px; }
		.chat-head { margin-bottom: 14px; }
		.router-title > a, .new-top { display: none; }
		.router-title h1 { font-size: 16px; }
		.router-title p { font-size: 9px; }
		.live { font-size: 9px; }
		.mobile-history-toggle { width: 38px; display: grid; place-items: center; padding: 0; font-size: 0; }
		.undo-top { width: 38px; padding: 0; font-size: 0; }
		.history-scrim { position: fixed; z-index: 54; inset: 0; display: block; width: 100%; height: 100%; padding: 0; background: rgba(14, 16, 13, .56); border: 0; }
		.history-panel { position: fixed; z-index: 55; inset: 0 auto 0 0; width: min(310px, 88vw); display: flex; transform: translateX(-102%); transition: transform var(--motion-standard) ease; box-shadow: 12px 0 30px rgba(12, 13, 11, .16); }
		.history-panel.open { transform: translateX(0); }
		.history-head .history-close { display: grid; }
		.chat-shell { grid-template-columns: 1fr; }
		.messages { padding: 22px 14px; }
		.welcome { padding-top: 24px; }
		.welcome h2 { font-size: 27px; }
		.welcome > p { font-size: 13px; }
		.prompts { margin-top: 20px; }
		.message { width: 100%; gap: 8px; }
		.message-profile { width: 34px; height: 34px; }
		.message-profile.assistant { width: 54px; height: 54px; margin: -9px -5px -9px -7px; }
		.message-profile.assistant :global(canvas) { width: 60px; height: 60px; }
		.bubble { font-size: 14px; }
		.composer-wrap { padding-inline: 10px; }
		.composer-meta small { display: none; }
		.setup-alert p { display: none; }
	}
</style>
