import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	// onnxruntime-node is a native module; keep it external so Vite/Rollup don't bundle it
	ssr: {
		external: ['@huggingface/transformers', '@node-rs/argon2']
	}
});
