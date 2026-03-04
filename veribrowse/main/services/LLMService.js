import { GoogleGenerativeAI } from '@google/generative-ai';
import Store from 'electron-store';

const store = new Store();
const MODEL_NAME = 'gemini-2.0-flash';

// -- Request Queue to prevent parallel hitting rate-limits --
let queuePromise = Promise.resolve();

function getModel() {
    const apiKey = store.get('geminiApiKey');
    if (!apiKey) {
        throw new Error('[LLMService] Gemini API Key not found in store.');
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({
        model: MODEL_NAME,
        generationConfig: {
            maxOutputTokens: 4096,
            temperature: 0.2,
        },
    });
}

/**
 * Detect Gemini rate-limit / quota errors.
 * Covers: HTTP 429, RESOURCE_EXHAUSTED gRPC code, and the human-readable variants.
 */
function isRateLimitError(err) {
    if (!err) return false;
    const msg = (err.message || '').toLowerCase();
    const status = err.status || err.statusCode || 0;
    return (
        status === 429 ||
        msg.includes('429') ||
        msg.includes('rate limit') ||
        msg.includes('quota exceeded') ||
        msg.includes('resource_exhausted') ||
        msg.includes('too many requests')
    );
}

/**
 * Retry with exponential back-off.
 *   attempt 1 → fail → wait 2 s  (+jitter)
 *   attempt 2 → fail → wait 4 s  (+jitter)
 *   attempt 3 → fail → wait 8 s  (+jitter)
 *   attempt 4 → throw
 *
 * Rate-limit errors get the full back-off.
 * Other errors get a 600 ms wait before the next try.
 */
async function withRetry(fn, maxAttempts = 4) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            if (attempt === maxAttempts) {
                console.error(`[LLMService] All ${maxAttempts} attempts failed:`, err.message);
                throw err;
            }
            if (isRateLimitError(err)) {
                const baseMs  = Math.pow(2, attempt) * 1000;          // 2 000, 4 000, 8 000
                const jitterMs = Math.random() * 800;                   // up to 800 ms extra
                const waitMs  = baseMs + jitterMs;
                console.warn(
                    `[LLMService] Rate limit on attempt ${attempt}/${maxAttempts} — ` +
                    `waiting ${Math.round(waitMs)} ms before retry…`
                );
                await new Promise(r => setTimeout(r, waitMs));
            } else {
                console.warn(
                    `[LLMService] Attempt ${attempt}/${maxAttempts} failed — ` +
                    `retrying in 600 ms…`, err.message
                );
                await new Promise(r => setTimeout(r, 600));
            }
        }
    }
}

/**
 * Enqueue an operation to prevent parallel requests wiping out quotas.
 */
function enqueue(operation) {
    const nextPromise = queuePromise.then(() => {
        return operation().catch(err => {
            console.error('[LLMService:Queue] Operation failed:', err.message);
            throw err;
        });
    });
    // Let the next job run regardless of whether this one succeeded
    queuePromise = nextPromise.catch(() => {});
    return nextPromise;
}

export async function generate(prompt, options = {}) {
    return enqueue(() => withRetry(async () => {
        const model = getModel();
        const result = await model.generateContent(prompt);
        return result.response.text();
    }));
}

export async function vision(prompt, base64PNG) {
    return enqueue(() => withRetry(async () => {
        // Ensure we have a raw base64 string (no data:image/png;base64, prefix)
        let cleanBase64 = typeof base64PNG === 'string' ? base64PNG : '';
        if (cleanBase64.includes(';base64,')) {
            cleanBase64 = cleanBase64.split(';base64,')[1];
        }

        const model = getModel();
        const result = await model.generateContent([
            { text: prompt },
            {
                inlineData: {
                    mimeType: 'image/png',
                    data: cleanBase64,
                },
            },
        ]);
        return result.response.text();
    }));
}

export async function generateJSON(prompt, schema = {}) {
    const jsonInstruction = `Return ONLY valid JSON. No markdown, no code fences, no explanation. Pure JSON only.`;
    const fullPrompt = `${prompt}\n\n${jsonInstruction}`;

    return enqueue(() => withRetry(async () => {
        const model = getModel();
        const result = await model.generateContent(fullPrompt);
        const raw = result.response.text();

        // Strip ALL markdown fence variants:
        //   ```json ... ```, ``` ... ```, ~~~json ... ~~~, leading/trailing whitespace
        const cleaned = raw
            .replace(/^[`~]{3,}(?:json)?\s*/i, '')  // opening fence
            .replace(/\s*[`~]{3,}\s*$/i, '')          // closing fence
            .trim();

        // DEBUG — always log in dev so parse errors are diagnosable
        if (process.env.NODE_ENV !== 'production') {
            console.log('[LLMService:generateJSON] Raw response (first 400 chars):', raw.slice(0, 400));
            console.log('[LLMService:generateJSON] Cleaned for parse:', cleaned.slice(0, 400));
        }

        try {
            return JSON.parse(cleaned);
        } catch (e) {
            // Attempt truncated JSON array recovery:
            // If the LLM output was cut off mid-array (maxOutputTokens reached),
            // find the last complete JSON object and close the array.
            const recovered = tryRecoverTruncatedArray(cleaned);
            if (recovered) {
                console.warn('[LLMService:generateJSON] Recovered truncated JSON array (' + recovered.length + ' items)');
                return recovered;
            }
            // Log the full raw response so we can see what went wrong
            console.error('[LLMService:generateJSON] JSON.parse failed. Full raw response:');
            console.error(raw);
            throw new Error(`[LLMService] JSON parse failed. First 200 chars: ${raw.slice(0, 200)}`);
        }
    }));
}

/**
 * Try to recover a truncated JSON array.
 * When maxOutputTokens cuts the response mid-stream, we get something like:
 *   [ { "type": "NAVIGATE", ... }, { "type": "CLICK", ... }, { "type": "CLI
 * This function finds the last complete object `}` and closes the array with `]`.
 */
function tryRecoverTruncatedArray(text) {
    if (!text || !text.startsWith('[')) return null;
    // Find the last complete object boundary: "},\n" or "}\n" or just "}"
    // We look for the last '}' that's followed by a comma, whitespace, or end of string
    // but NOT inside a string value.
    let lastCompleteEnd = -1;
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\' && inString) { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;

        if (ch === '{' || ch === '[') depth++;
        if (ch === '}' || ch === ']') {
            depth--;
            // When depth returns to 1, we've closed a top-level array element
            if (depth === 1 && ch === '}') {
                lastCompleteEnd = i;
            }
        }
    }

    if (lastCompleteEnd <= 0) return null;

    // Slice up to (and including) the last complete object, remove trailing comma, close array
    let recovered = text.slice(0, lastCompleteEnd + 1).trimEnd();
    if (recovered.endsWith(',')) recovered = recovered.slice(0, -1);
    recovered += '\n]';

    try {
        const parsed = JSON.parse(recovered);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch { /* recovery failed */ }
    return null;
}
