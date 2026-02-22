import { GoogleGenerativeAI } from '@google/generative-ai';
import Store from 'electron-store';

const store = new Store();
// NOTE: Embedding model availability depends on the API key tier.
// 'text-embedding-004' and 'embedding-001' both 404 on free/basic keys.
// We return null on failure — all DB vector columns are nullable so this is safe.
const EMBEDDING_MODEL = 'text-embedding-004';


function getClient() {
    const apiKey = store.get('geminiApiKey') || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('[EmbeddingService] No API Key found.');
    return new GoogleGenerativeAI(apiKey);
}

const truncate = (text) => (text ? text.slice(0, 2000) : '');

/**
 * Generate a vector embedding for a single string.
 * Returns null if embedding is not available (non-fatal).
 */
export async function embed(text) {
    try {
        const genAI = getClient();
        const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
        const result = await model.embedContent(truncate(text));
        return result.embedding.values;
    } catch (err) {
        // Silently skip — embedding model may not be available on this API key tier.
        // All DB vector columns are nullable so null is safe.
        console.info('[EmbeddingService] Embedding skipped (model unavailable):', err.message.slice(0, 80));
        return null;
    }
}

/**
 * Generate embeddings for multiple strings in batch.
 */
export async function embedBatch(texts = []) {
    if (!texts.length) return [];
    try {
        const genAI = getClient();
        const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
        const result = await model.batchEmbedContents({
            requests: texts.map((t) => ({
                content: { parts: [{ text: truncate(t) }] },
                model: `models/${EMBEDDING_MODEL}`,
            })),
        });
        return result.embeddings.map((e) => e.values);
    } catch (err) {
        console.error('[EmbeddingService] batchEmbedContents failed:', err.message);
        return texts.map(() => new Array(768).fill(0));
    }
}
