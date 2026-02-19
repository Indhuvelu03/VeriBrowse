import LLMManager from '../main/services/LLMManager.js';
import dotenv from 'dotenv';
import path from 'path';

// Load env 
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Mock console to keep output clean
const originalConsole = console.log;

async function runTests() {
    console.log('🧪 Starting LLMManager Queue & Fallback Tests...\n');

    // TEST 1: QUEUE SEQUENCING
    console.log('Test 1: Verifying Request Queue (FIFO)...');

    // Create instance with dummy key (we will mock execution anyway)
    const llm = new LLMManager('dummy-key');

    // Mock the internal executor to simulate work
    llm._executeGemini = async (msg) => {
        const id = msg.split(' ')[1];
        originalConsole(`[MockGemini] Starting Request ${id}`);
        await new Promise(r => setTimeout(r, 500)); // 500ms delay
        originalConsole(`[MockGemini] Finished Request ${id}`);
        return { type: 'text', text: `Response ${id}` };
    };

    const start = Date.now();

    // Fire 3 concurrent requests
    const p1 = llm.chat('Request 1');
    const p2 = llm.chat('Request 2');
    const p3 = llm.chat('Request 3');

    await Promise.all([p1, p2, p3]);
    const end = Date.now();

    // Total time should be > 1500ms (3 * 500ms)
    // If parallel, it would be ~500ms
    const duration = end - start;
    console.log(`⏱️ Total Duration: ${duration}ms (Expected ~1500ms)`);

    if (duration > 1400) {
        console.log('✅ PASS: Requests executed sequentially.');
    } else {
        console.error('❌ FAIL: Requests executed in parallel!');
    }

    console.log('\n--------------------------------------------------\n');

    // TEST 2: FALLBACK MECHANISM
    console.log('Test 2: Verifying Auto-Fallback to OpenRouter...');

    // Mock Gemini to fail
    llm._executeGemini = async () => {
        throw new Error('[429] Resource has been exhausted (Quota exceeded)');
    };

    // Mock OpenRouter to succeed
    let fallbackCalled = false;
    llm._executeOpenRouter = async (msg) => {
        fallbackCalled = true;
        console.log(`[MockOpenRouter] Handling fallback for: "${msg}"`);
        return { type: 'text', text: 'Fallback Success' };
    };

    try {
        const response = await llm.chat('Trigger Fail');
        if (fallbackCalled && response.text === 'Fallback Success') {
            console.log('✅ PASS: Automatically switched to OpenRouter on error.');
        } else {
            console.error('❌ FAIL: Fallback logic did not trigger correctly.');
        }
    } catch (e) {
        console.error('❌ FAIL: Exception leaked out instead of handling fallback:', e);
    }
}

runTests().catch(console.error);
