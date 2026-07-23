export function friendlyAiError(error: unknown): string {
	const raw = error instanceof Error ? error.message : String(error);
	if (/content-blocked/i.test(raw)) {
		return 'Permintaan ditolak oleh filter konten penyedia AI. Pesan dibatalkan dan tidak disimpan. Ubah sedikit susunan pertanyaan, lalu coba lagi setelah 30 detik.';
	}
	if (/\b429\b|rate.?limit|reset after/i.test(raw)) {
		return 'Penyedia AI sedang membatasi permintaan. Pesan dibatalkan dan tidak disimpan. Tunggu sebentar, lalu coba lagi.';
	}
	if (/POST \/chat\/completions\s*->\s*4\d\d/i.test(raw)) {
		return 'Penyedia AI menolak permintaan. Pesan dibatalkan dan tidak disimpan. Periksa konfigurasi model atau ubah pertanyaan, lalu coba lagi.';
	}
	if (/POST \/chat\/completions/i.test(raw)) {
		return 'Penyedia AI tidak dapat memproses permintaan saat ini. Pesan dibatalkan dan tidak disimpan. Silakan coba lagi.';
	}
	return 'Respons AI gagal diproses. Pesan dibatalkan dan tidak disimpan. Silakan coba lagi.';
}
