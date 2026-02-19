import { ipcMain } from 'electron';
import LLMManager from '../services/LLMManager.js';
import ToolOrchestrator from '../agent/ToolOrchestrator.js';
import BrowserService from '../services/BrowserService.js';
import AgentLoop from '../agent/AgentLoop.js';
import PlannerService from '../services/PlannerService.js';

let llmManager = null;
let orchestrator = null;
let browserService = null;
let agentLoop = null;
let plannerService = null;

// Request Serialization Queue
let isAgentBusy = false;
let taskQueue = [];

/**
 * Agent Handlers (Production Flow)
 * Coordinates the AgentLoop, LLMManager, PlannerService, and ToolOrchestrator.
 */
export function registerAgentHandlers(window, browserView) {
    // Initialize services
    browserService = new BrowserService(window, browserView);
    orchestrator = new ToolOrchestrator(browserService);

    // IPC Handlers

    ipcMain.handle('agent:chat', async (event, args) => { // args: { message, mode }
        // Serialize execution
        if (isAgentBusy) {
            console.log('[AgentHandlers] Agent busy. Queuing request...');
            return new Promise((resolve) => {
                taskQueue.push({ event, args, resolve });
            });
        }

        return processAgentRequest(event, args);
    });

    async function processAgentRequest(event, { message, mode }) {
        isAgentBusy = true;

        try {
            // Lazy init LLM if needed
            if (!llmManager) {
                const key = process.env.GEMINI_API_KEY;
                const openRouterKey = process.env.OPENROUTER_API_KEY || null;
                if (key) {
                    llmManager = new LLMManager(key, openRouterKey);
                    agentLoop = new AgentLoop(llmManager, orchestrator);
                    plannerService = new PlannerService(llmManager);
                } else {
                    return { success: false, error: 'API Key missing. Please set it in Settings or .env.local' };
                }
            }

            if (!agentLoop || !plannerService) return { success: false, error: 'Agent services not initialized' };

            // Start fresh for new task
            llmManager.clearHistory();

            // Request a new tab for this mission so we don't overwrite user's work
            event.sender.send('browser:add-tab', {
                id: `agent-${Date.now()}`,
                title: 'Aeon Agent',
                url: 'about:blank',
                active: true
            });

            // 1. Planning Phase — Gemini call #1 (returns structured JSON steps)
            event.sender.send('agent:progress', {
                status: 'planning',
                message: 'Formulating execution plan...'
            });

            const steps = await plannerService.generatePlan(message);
            console.log('[AgentHandlers] Plan ready:', steps);

            if (!steps || steps.length === 0) {
                return { success: false, error: 'Planner returned no steps. Please try again.' };
            }

            // Generate a better title for the tab
            const tabTitle = message.length > 25 ? message.substring(0, 25) + '...' : message;

            // Request a new tab for this mission so we don't overwrite user's work
            event.sender.send('browser:add-tab', {
                id: `agent-${Date.now()}`,
                title: `AI: ${tabTitle}`,
                url: 'about:blank',
                active: true
            });

            // Inform the UI of the plan
            event.sender.send('agent:progress', {
                status: 'plan_ready',
                steps: steps.map(s => s.description || s.tool),
                message: `Executing ${steps.length} steps...`
            });

            // 2. Execution Phase — steps run directly, Gemini #2 only for final summary
            const result = await agentLoop.run(message, steps, mode, (progress) => {
                event.sender.send('agent:progress', progress);
            });

            // Signal completion to UI
            event.sender.send('agent:progress', {
                status: 'complete',
                success: result.success
            });

            return result;

        } catch (error) {
            console.error('[AgentHandlers] Error in agent flow:', error);
            // Signal error to UI
            event.sender.send('agent:progress', {
                status: 'error',
                error: error.message
            });
            return { success: false, error: error.message };
        } finally {
            isAgentBusy = false;
            // Process next in queue
            if (taskQueue.length > 0) {
                const next = taskQueue.shift();
                console.log('[AgentHandlers] Processing queued request...');
                // We don't await here to let the current handler return, 
                // but processAgentRequest is async so it runs in background.
                processAgentRequest(next.event, next.args).then(next.resolve);
            }
        }
    }

    ipcMain.handle('agent:initialize', async (event, apiKey) => {
        try {
            console.log('[AgentHandlers] Initializing with provided API key...');
            llmManager = new LLMManager(apiKey, process.env.OPENROUTER_API_KEY || null);
            agentLoop = new AgentLoop(llmManager, orchestrator);
            plannerService = new PlannerService(llmManager);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('agent:check-status', () => {
        return {
            initialized: llmManager !== null,
            historyLength: llmManager ? llmManager.getHistory().length : 0,
            busy: isAgentBusy,
            queueLength: taskQueue.length
        };
    });

    ipcMain.handle('agent:cleanup', async () => {
        if (browserService) await browserService.close();
        llmManager = null;
        agentLoop = null;
        plannerService = null;
        taskQueue = [];
        isAgentBusy = false;
        return { success: true };
    });

    console.log('[AgentHandlers] VeriBrowse Agent IPC routes active.');
}
