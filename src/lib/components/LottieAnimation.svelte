<script lang="ts">
	import { onMount } from 'svelte';

	let { src, speed = 1, autoplay = true, loop = true }: { src: string; speed?: number; autoplay?: boolean; loop?: boolean } = $props();
	let canvas: HTMLCanvasElement;

	onMount(() => {
		let disposed = false;
		let player: { destroy: () => void } | undefined;
		const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		void Promise.all([
			import('@lottiefiles/dotlottie-web'),
			import('@lottiefiles/dotlottie-web/dotlottie-player.wasm?url')
		]).then(([{ DotLottie }, { default: wasmUrl }]) => {
			if (disposed) return;
			DotLottie.setWasmUrl(wasmUrl);
			player = new DotLottie({
				canvas,
				src,
				autoplay: autoplay && !reduceMotion,
				loop: loop && !reduceMotion,
				speed,
				backgroundColor: 'transparent',
				layout: { fit: 'contain', align: [0.5, 0.5] },
				renderConfig: { autoResize: true, freezeOnOffscreen: true }
			});
		});

		return () => {
			disposed = true;
			player?.destroy();
		};
	});
</script>

<canvas bind:this={canvas} aria-hidden="true"></canvas>

<style>
	canvas { width: 100%; height: 100%; display: block; }
</style>
