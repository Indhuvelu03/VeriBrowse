import { useEffect } from 'react';
import { useTabStore } from '../store/tabStore';
import { useWorkflowStore } from '../store/workflowStore';
import { useUIStore } from '../store/uiStore';

/**
 * useIPCListeners
 *
 * Sets up all Electron IPC listeners on mount and cleans them up on unmount.
 * Uses the new namespaced electronAPI.on(channel, callback) generic listener.
 */

export default function useIPCListeners() {
    const { addTab, updateTab, removeTab, setActiveTab, addShadowTab, updateShadowTab, removeShadowTab } = useTabStore();
    const {
        updateStatus,
        updateStep,
        setPause,
        setResumed,
        setSummary,
        setError,
        setCredits,
        setSteps,
        addMessage
    } = useWorkflowStore();
    const { addToast, setActiveView, closeOverlays } = useUIStore();

    useEffect(() => {
        const api = window.electronAPI;
        if (!api) return;

        // --- BROWSER / TAB EVENTS ---
        api.on('browser:user-tab-created', (tab) => {
            addTab(tab);
            if (tab.url && tab.url !== 'about:blank') {
                setActiveView('browser');
            }
        });

        api.on('browser:user-tab-updated', (data) => {
            // If this tab isn't in the store yet, add it first (handles race with
            // the 2s-delayed browser:user-tab-created from initializePlaywright)
            const { userTabs } = useTabStore.getState();
            if (!userTabs.find(t => t.id === data.tabId)) {
                addTab({ id: data.tabId, url: data.url, title: data.title, favicon: null, isLoading: false });
            } else {
                updateTab(data.tabId, {
                    url: data.url,
                    title: data.title,
                    isLoading: data.isLoading
                });
            }
            if (data.url && data.url !== 'about:blank') {
                setActiveView('browser');
                closeOverlays();
            }
        });


        api.on('browser:user-tab-switched', ({ tabId }) => {
            setActiveTab(tabId);
        });

        api.on('browser:user-tab-closed', ({ tabId }) => {
            removeTab(tabId);
        });

        // --- SHADOW TAB EVENTS ---
        api.on('browser:shadow-tab-created', (tab) => {
            addShadowTab(tab);
        });

        api.on('browser:shadow-tab-updated', (data) => {
            updateShadowTab(data.tabId, {
                url: data.url,
                title: data.title,
                isLoading: data.isLoading
            });
        });

        api.on('browser:shadow-tab-closed', ({ tabId }) => {
            removeShadowTab(tabId);
        });

        // --- WORKFLOW / STEP EVENTS ---
        api.on('workflow:step-updated', (data) => {
            if (data.steps) {
                setSteps(data.steps);
            } else {
                updateStep(data.stepId, {
                    status: data.status,
                    result: data.result
                });
            }
        });

        api.on('workflow:paused', ({ reason }) => {
            setPause(true, reason);
            if (reason === 'hitl') {
                addToast('Agent needs your help with a verification.', 'warning');
            }
        });

        api.on('workflow:resumed', () => {
            setResumed();
        });

        // --- AGENT STATUS EVENTS ---
        api.on('agent:status', (data) => {
            updateStatus(data);
        });

        api.on('agent:summary-ready', ({ summary }) => {
            setSummary(summary);
            addToast('Task completed.', 'success');
        });

        api.on('agent:chat-response', ({ goal, response }) => {
            addMessage('agent', response);
            updateStatus({ status: 'idle', message: 'Ready' });
            // Mark as not running since chat responses are instant
            useWorkflowStore.getState().setError(null);
            useWorkflowStore.setState({ isRunning: false, agentStatus: 'idle' });
        });

        api.on('agent:error', ({ error }) => {
            setError(error);
            addToast(`Error: ${error}`, 'error');
        });

        // Rate-limit feedback — emitted by IPCGuard when agent:run is rejected
        // because a task is still running or within the post-task cooldown.
        api.on('agent:rate-limited', ({ channel, reason }) => {
            console.warn(`[useIPCListeners] Rate-limited on "${channel}" (${reason})`);
            // If the store got stuck in isRunning, reset it so the user can retry.
            const { isRunning } = useWorkflowStore.getState();
            if (reason === 'cooldown' && isRunning) {
                // Cooldown means the previous task DID finish — reset isRunning.
                useWorkflowStore.setState({ isRunning: false, agentStatus: 'idle' });
            }
            // We intentionally do NOT show a toast for 'already_running'
            // since the UI already shows the agent is working.
            if (reason === 'cooldown') {
                addToast('Please wait a moment before starting a new task.', 'info');
            }
        });

        // --- AUTONOMOUS LOOP STEP EVENTS ---
        api.on('agent:execution-step', (step) => {
            // Forward live step updates from the autonomous browserAgentLoop to the workflow store
            const { steps } = useWorkflowStore.getState();
            const newStep = {
                id: `auto-${Date.now()}`,
                tool: step.action || 'unknown',
                description: step.thought || '',
                status: step.status === 'success' ? 'done' : step.status === 'fail' ? 'failed' : 'executing',
                result: step.result || step.verification || null,
            };
            setSteps([...steps, newStep]);

            // Update agent status based on step
            if (step.status === 'success' && step.action === 'DONE') {
                setSummary(step.result || step.thought);
                addToast('Autonomous task completed.', 'success');
            }
        });

        api.on('agent:autonomous-done', ({ result }) => {
            updateStatus({ status: 'idle', message: 'Ready' });
            useWorkflowStore.setState({ isRunning: false, agentStatus: 'idle' });
            // NOTE: do NOT call setSummary here — agent:execution-step DONE already set it.
            // Calling setSummary again would duplicate the completion message in the chat.
        });

        // --- CREDIT EVENTS ---
        api.on('credit:updated', ({ callsUsed }) => {
            setCredits(callsUsed);
        });

        api.on('credit:warning', ({ callsUsed }) => {
            addToast(`Note: ${callsUsed}/300 units used.`, 'info');
        });

        api.on('credit:critical', ({ callsUsed }) => {
            addToast(`CRITICAL: ${callsUsed}/300 units used. Action required.`, 'error');
        });

        // Cleanup
        return () => {
            const channels = [
                'browser:user-tab-created',
                'browser:user-tab-updated',
                'browser:user-tab-switched',
                'browser:user-tab-closed',
                'workflow:step-updated',
                'workflow:paused',
                'workflow:resumed',
                'agent:status',
                'agent:summary-ready',
                'agent:chat-response',
                'agent:error',
                'agent:rate-limited',
                'agent:execution-step',
                'agent:autonomous-done',
                'credit:updated',
                'credit:warning',
                'credit:critical',
                'browser:shadow-tab-created',
                'browser:shadow-tab-updated',
                'browser:shadow-tab-closed',
            ];
            channels.forEach(ch => api.removeAllListeners(ch));
        };
    }, []);
}
