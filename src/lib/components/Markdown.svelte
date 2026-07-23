<script lang="ts">
	import { parseMarkdown, renderInline } from '$lib/markdown';
	let { content } = $props<{ content: string }>();
	const blocks = $derived(parseMarkdown(content.replace(/\s*\u2014\s*/g, ', ')));
	let copiedIndex = $state<number | null>(null);

	async function copyCode(code: string, index: number) {
		await navigator.clipboard.writeText(code);
		copiedIndex = index;
		setTimeout(() => { if (copiedIndex === index) copiedIndex = null; }, 1600);
	}
</script>

<div class="markdown">
	{#each blocks as block, index}
		{#if block.type === 'heading'}
			{#if block.level <= 2}<h2>{@html renderInline(block.text)}</h2>{:else}<h3>{@html renderInline(block.text)}</h3>{/if}
		{:else if block.type === 'paragraph'}
			<p>{@html renderInline(block.text)}</p>
		{:else if block.type === 'list'}
			{#if block.ordered}<ol start={block.start}>{#each block.items as item}<li>{@html renderInline(item)}</li>{/each}</ol>{:else}<ul>{#each block.items as item}<li>{@html renderInline(item)}</li>{/each}</ul>{/if}
		{:else if block.type === 'quote'}
			<blockquote>{@html renderInline(block.text)}</blockquote>
		{:else if block.type === 'rule'}
			<hr />
		{:else if block.type === 'table'}
			<div class="table-wrap"><table><thead><tr>{#each block.headers as header}<th>{@html renderInline(header)}</th>{/each}</tr></thead><tbody>{#each block.rows as row}<tr>{#each row as cell}<td>{@html renderInline(cell)}</td>{/each}</tr>{/each}</tbody></table></div>
		{:else if block.type === 'code'}
			<div class="code-block"><div><span>{block.language || 'perintah'}</span><button type="button" aria-live="polite" onclick={() => copyCode(block.code, index)}>{copiedIndex === index ? 'Tersalin' : 'Salin'}</button></div><pre><code>{block.code}</code></pre></div>
		{/if}
	{/each}
</div>

<style>
	.markdown { min-width: 0; display: grid; gap: 11px; white-space: normal; }
	.markdown :global(h2), .markdown :global(h3), .markdown :global(p), .markdown :global(ul), .markdown :global(ol), .markdown :global(blockquote) { margin: 0; }
	h2 { margin: 7px 0 1px; color: inherit; font-size: 17px; line-height: 1.35; letter-spacing: -.015em; }
	h3 { margin: 5px 0 0; color: inherit; font-size: 15px; line-height: 1.4; }
	p { line-height: 1.7; }
	ul, ol { min-width: 0; display: grid; gap: 6px; padding-left: 22px; line-height: 1.6; }
	li { min-width: 0; padding-left: 3px; overflow-wrap: anywhere; }
	blockquote { padding: 11px 13px; color: var(--text-secondary); background: var(--surface-subtle); border-top: 1px solid var(--border-default); border-bottom: 1px solid var(--border-default); }
	hr { width: 100%; height: 1px; margin: 3px 0; background: #d8d7d2; border: 0; }
	.markdown :global(strong) { color: inherit; font-weight: 750; }
	.markdown :global(code) { padding: 2px 5px; color: #253000; background: #e6edc5; border-radius: 1px; font-family: var(--font-data); font-size: .9em; }
	.markdown :global(a) { color: #155eef; text-decoration-thickness: 1px; text-underline-offset: 2px; }
	.table-wrap { max-width: 100%; overflow-x: auto; border: 1px solid #d8d7d2; border-radius: 2px; }
	table { width: 100%; border-collapse: collapse; font-size: 12px; white-space: nowrap; }
	th, td { padding: 9px 11px; border-bottom: 1px solid #deddd8; text-align: left; }
	th { color: #3d413c; background: #e9e8e2; font-size: 11px; font-weight: 750; }
	tbody tr:last-child td { border-bottom: 0; }
	.code-block { max-width: 100%; overflow: hidden; background: #f8f7f1; border: 1px solid var(--border-default); border-radius: var(--radius-control); }
	.code-block > div { min-height: 34px; display: flex; align-items: center; justify-content: space-between; padding: 0 9px 0 13px; color: var(--text-secondary); background: var(--surface-subtle); border-bottom: 1px solid var(--border-default); font-family: var(--font-data); font-size: 10px; }
	.code-block button { padding: 4px 8px; color: #252a16; background: var(--action-primary); border: 1px solid var(--action-primary-border); border-radius: 1px; cursor: pointer; font-family: inherit; font-size: 10px; font-weight: 700; }
	.code-block button:hover { background: #cce642; border-color: #9fb52b; }
	pre { max-width: 100%; margin: 0; overflow-x: auto; padding: 13px 14px; color: #282b26; background: #f8f7f1; font-family: var(--font-data); font-size: 12px; line-height: 1.65; tab-size: 2; white-space: pre; }
	.code-block pre code { display: block; padding: 0; color: inherit; background: transparent; border-radius: 0; font: inherit; }
</style>
