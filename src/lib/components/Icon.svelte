<script lang="ts">
	let { name, size = 20, strokeWidth = 1.8, label = '' } = $props<{
		name: string;
		size?: number;
		strokeWidth?: number;
		label?: string;
	}>();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden={label ? undefined : 'true'}
	aria-label={label || undefined}
>
	{#if name === 'router'}
		<rect x="3" y="8" width="18" height="10" rx="2"/><path d="M7 8V5m10 3V5M7 13h.01M11 13h.01M16 13h2"/>
	{:else if name === 'settings'}
		<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9 1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"/>
	{:else if name === 'sparkles'}
		<path d="m12 3-1.1 3.2a2.6 2.6 0 0 1-1.7 1.7L6 9l3.2 1.1a2.6 2.6 0 0 1 1.7 1.7L12 15l1.1-3.2a2.6 2.6 0 0 1 1.7-1.7L18 9l-3.2-1.1a2.6 2.6 0 0 1-1.7-1.7L12 3Z"/><path d="m19 15-.6 1.7a1.3 1.3 0 0 1-.8.8L16 18l1.6.5a1.3 1.3 0 0 1 .8.8L19 21l.6-1.7a1.3 1.3 0 0 1 .8-.8L22 18l-1.6-.5a1.3 1.3 0 0 1-.8-.8L19 15Z"/>
	{:else if name === 'plus'}
		<path d="M12 5v14M5 12h14"/>
	{:else if name === 'menu'}
		<path d="M4 7h16M4 12h16M4 17h16"/>
	{:else if name === 'x'}
		<path d="m6 6 12 12M18 6 6 18"/>
	{:else if name === 'logout'}
		<path d="M10 17l5-5-5-5M15 12H3M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/>
	{:else if name === 'arrow-left'}
		<path d="m15 18-6-6 6-6"/>
	{:else if name === 'arrow-right'}
		<path d="m9 18 6-6-6-6"/>
	{:else if name === 'trash'}
		<path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6"/>
	{:else if name === 'undo'}
		<path d="M9 7 4 12l5 5M5 12h8a6 6 0 0 1 6 6v1"/>
	{:else if name === 'edit'}
		<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>
	{:else if name === 'activity'}
		<path d="M3 12h4l2-7 4 14 2-7h6"/>
	{:else if name === 'shield'}
		<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>
	{:else if name === 'server'}
		<rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01"/>
	{:else if name === 'wifi'}
		<path d="M5 12.6a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01M2 9a15 15 0 0 1 20 0"/>
	{:else if name === 'test'}
		<path d="M9 2v6l-5 9a3 3 0 0 0 2.6 4h10.8a3 3 0 0 0 2.6-4l-5-9V2M7 2h10M7 15h10"/>
	{:else if name === 'lock'}
		<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>
	{:else if name === 'mail'}
		<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>
	{:else if name === 'key'}
		<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8m-3 3 2 2m-5 1 2 2"/>
	{:else if name === 'check'}
		<path d="m5 12 4 4L19 6"/>
	{:else if name === 'alert'}
		<path d="M12 3 2.5 20h19ZM12 9v4m0 3h.01"/>
	{:else if name === 'eye'}
		<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>
	{:else if name === 'eye-off'}
		<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-2 2.7M6.6 6.6C3.6 8.5 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 4.1-.9"/>
	{:else if name === 'send'}
		<path d="m22 2-7 20-4-9-9-4ZM22 2 11 13"/>
	{:else if name === 'message'}
		<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/>
	{:else if name === 'image'}
		<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 15-5-5L5 20"/>
	{:else if name === 'clock'}
		<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
	{:else if name === 'chevron-down'}
		<path d="m6 9 6 6 6-6"/>
	{:else}
		<circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01"/>
	{/if}
</svg>
