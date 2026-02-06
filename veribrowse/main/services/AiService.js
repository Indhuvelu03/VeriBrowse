import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import dns from 'dns';
import { promisify } from 'util';

const dnsLookup = promisify(dns.lookup);

// Hardcode keys directly for now since dotenv path resolution is failing in Electron
const geminiKeys = [
  'AIzaSyD_kL-UW7w1J-MNpycIpsNryD4hOZB0uqw',
  'AIzaSyDFTC4XZQEzWESqpGq1r4KTSf3uiGMPyJU',
].filter(Boolean);

console.log('[AiService] Gemini keys loaded:', geminiKeys.length);

let geminiKeyIndex = 0;
const nextGeminiClient = () => {
  if (!geminiKeys.length) return null;
  const key = geminiKeys[geminiKeyIndex % geminiKeys.length];
  geminiKeyIndex += 1;
  return new GoogleGenerativeAI(key);
};

const localAI = new OpenAI({
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'ollama',
});

const isOnline = async () => {
  try {
    await dnsLookup('generativelanguage.googleapis.com');
    return true;
  } catch {
    return false;
  }
};

const resolveGeminiModel = (taskType) => {
  switch (taskType) {
    case 'search':
      return 'gemini-1.5-flash';
    case 'execution':
      return 'gemini-1.5-pro';
    case 'offline_summary':
      return 'gemini-1.5-flash';
    default:
      return 'gemini-1.5-flash';
  }
};

const resolveOllamaModel = (taskType) => {
  switch (taskType) {
    case 'execution':
      return 'llama3.2';
    case 'offline_summary':
      return 'llama3.2';
    case 'search':
    default:
      return 'llama3.2';
  }
};

export const runAgentTask = async (taskType, userInput) => {
  console.log('[AiService] runAgentTask called:', taskType, userInput?.substring(0, 50));

  const online = await isOnline();
  console.log('[AiService] Online status:', online);

  // If offline or explicitly requesting offline_summary, use Ollama
  if (!online || taskType === 'offline_summary') {
    console.log('[AiService] Using Ollama (offline mode)');
    try {
      const model = resolveOllamaModel(taskType);
      const response = await localAI.chat.completions.create({
        model,
        messages: [{ role: 'user', content: userInput }],
      });
      return { success: true, answer: response.choices[0]?.message?.content || '' };
    } catch (ollamaError) {
      console.error('[AiService] Ollama error:', ollamaError?.message || ollamaError);
      return { success: false, error: 'Offline and Ollama unavailable. Start Ollama with: ollama serve' };
    }
  }

  // Online: use Gemini
  const geminiClient = nextGeminiClient();
  if (!geminiClient) {
    console.log('[AiService] No Gemini keys available');
    return { success: false, error: 'Gemini API keys not configured.' };
  }

  try {
    const model = resolveGeminiModel(taskType);
    console.log('[AiService] Calling Gemini with model:', model);
    const generativeModel = geminiClient.getGenerativeModel({ model });
    const result = await generativeModel.generateContent(userInput);
    const answer = result?.response?.text?.() || '';
    console.log('[AiService] Gemini success, answer length:', answer.length);
    return { success: true, answer };
  } catch (error) {
    console.error('[AiService] Gemini error:', error?.message || error);
    return { success: false, error: error?.message || 'Gemini request failed.' };
  }
};

export const healthCheck = async () => {
  const status = {
    gemini: { ok: false, error: null },
    ollama: { ok: false, error: null },
  };

  try {
    const geminiClient = nextGeminiClient();
    if (!geminiClient) {
      status.gemini.error = 'GEMINI_API_KEY_1 or GEMINI_API_KEY_2 is not set.';
    } else {
      const model = resolveGeminiModel('search');
      const generativeModel = geminiClient.getGenerativeModel({ model });
      await generativeModel.generateContent('ping');
      status.gemini.ok = true;
    }
  } catch (error) {
    status.gemini.error = error?.message || 'Gemini check failed.';
  }

  try {
    const model = resolveOllamaModel('offline_summary');
    await localAI.chat.completions.create({
      model,
      messages: [{ role: 'user', content: 'ping' }],
    });
    status.ollama.ok = true;
  } catch (error) {
    status.ollama.error = error?.message || 'Ollama check failed.';
  }

  return { success: status.gemini.ok || status.ollama.ok, status };
};

export default {
  runAgentTask,
  healthCheck,
};
