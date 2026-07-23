// Local text embeddings via transformers.js (no external provider; 9router has no embeddings).
// Model: Xenova/all-MiniLM-L6-v2 (384-dim). Downloads once to local cache on first use.
import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_DIM = 384;

let extractor: FeatureExtractionPipeline | null = null;
let loading: Promise<FeatureExtractionPipeline> | null = null;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
	if (extractor) return extractor;
	if (!loading) {
		loading = pipeline('feature-extraction', MODEL_ID).then((p) => {
			extractor = p as FeatureExtractionPipeline;
			return extractor;
		});
	}
	return loading;
}

/** Embed a single string into a 384-dim unit vector (mean-pooled + normalized). */
export async function embed(text: string): Promise<number[]> {
	const ex = await getExtractor();
	const output = await ex(text, { pooling: 'mean', normalize: true });
	return Array.from(output.data as Float32Array);
}

/** Embed many strings sequentially (keeps memory low on small hosts). */
export async function embedBatch(texts: string[]): Promise<number[][]> {
	const out: number[][] = [];
	for (const t of texts) out.push(await embed(t));
	return out;
}

/** Cosine similarity of two equal-length vectors. Vectors from `embed` are already normalized. */
export function cosine(a: number[], b: number[]): number {
	if (a.length === 0 || a.length !== b.length) return -1;
	let dot = 0;
	for (let i = 0; i < a.length; i++) {
		if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) return -1;
		dot += a[i] * b[i];
	}
	return dot;
}
