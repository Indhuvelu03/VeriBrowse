import bus from '../core/EventBus.js';
import * as CreditGuard from '../core/CreditGuard.js';

/**
 * SummaryAgent
 * 
 * Generates a final structured markdown summary of a completed workflow.
 * Uses a single CreditGuard call to synthesize all step results into a cohesive answer.
 * Calls CreditGuard (never LLMService directly).
 */

class SummaryAgent {
    constructor() {
        this.setupListeners();
    }

    setupListeners() {
        // Explicit request to summarize from the WorkflowEngine
        bus.on('workflow:summarize', async ({ goal, steps }) => {
            await this.generateSummary(goal, steps);
        });
    }

    async generateSummary(goal, steps) {
        console.log(`[SummaryAgent] Generating summary for goal: ${goal}`);
        bus.emit('agent:status', { message: 'Writing summary...', status: 'summarizing' });

        const resultsContext = steps
            .filter(s => s.status === 'done' && s.result)
            .map(s => `Step: ${s.description}\nResult: ${JSON.stringify(s.result).slice(0, 1000)}`)
            .join('\n\n');

        const prompt = `
Original Goal: ${goal}

I have completed the following steps:
${resultsContext}

Please provide a concise, professional markdown summary of the outcome. 
If data was extracted (like prices, dates, or emails), present it in a clean table or list.
If the goal was a question, answer it directly.
Keep the tone professional and helpful.
`.trim();

        try {
            // Direct call to CreditGuard to ensure budget tracking/caching
            const summary = await CreditGuard.generate(prompt);

            bus.emit('agent:summary-ready', { summary });
            bus.emit('agent:status', { message: 'Task complete', status: 'idle' });

        } catch (err) {
            console.error('[SummaryAgent] Summary generation failed:', err.message);
            bus.emit('agent:summary-ready', {
                summary: `Task completed, but summary generation failed: ${err.message}`
            });
        }
    }
}

// Instantiate the agent
new SummaryAgent();
export default SummaryAgent;
