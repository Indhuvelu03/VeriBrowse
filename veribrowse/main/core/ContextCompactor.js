/**
 * ContextCompactor.js
 *
 * Manages context compression for the autonomous agent loop.
 * Prevents unbounded context growth that would blow the LLM token window.
 *
 * Three data structures maintained per task:
 *
 *   1. Page Summaries   — Compressed text from visited pages (replaces raw DOM history)
 *   2. Task Progress    — Running log of what's been accomplished vs. what remains
 *   3. Action Traces    — Last N successful actions (sliding window)
 *
 * Core principle: "Remember WHAT happened, forget HOW it looked."
 *
 * Usage in AutonomousLoop:
 *   - After each verified action → compactor.addAction(action, snapshot)
 *   - Before replanning        → compactor.getCompactContext() provides a compressed prompt
 *   - On page navigation       → compactor.addPageSummary(url, title, visibleText)
 */

import * as CreditGuard from './CreditGuard.js';

// ─── Constants ──────────────────────────────────────────────────────────
const MAX_ACTION_TRACES = 12;       // sliding window of recent actions
const MAX_PAGE_SUMMARIES = 8;       // max pages we remember
const MAX_SUMMARY_CHARS = 500;      // per-page summary length
const MAX_VISIBLE_TEXT = 1500;       // text we keep from DOM snapshot

class ContextCompactor {
    constructor() {
        this.reset();
    }

    /**
     * Reset all context for a new task.
     */
    reset() {
        this.goal = '';
        this.pageSummaries = [];      // [{ url, title, summary, timestamp }]
        this.actionTraces = [];       // [{ type, description, success, timestamp }]
        this.taskProgress = {
            completedSteps: 0,
            totalPlannedSteps: 0,
            currentPhase: 'idle',     // idle | planning | executing | verifying | done
            milestones: [],           // ["Navigated to amazon.com", "Searched for laptops"]
        };
    }

    /**
     * Initialize for a new task.
     */
    startTask(goal, totalSteps = 0) {
        this.reset();
        this.goal = goal;
        this.taskProgress.totalPlannedSteps = totalSteps;
        this.taskProgress.currentPhase = 'planning';
    }

    // ─── Page Summaries ─────────────────────────────────────────────────

    /**
     * Add a compressed page summary. Called after navigation or page change.
     * Uses a simple truncation strategy (no LLM call) to stay fast.
     *
     * @param {string} url
     * @param {string} title
     * @param {string} visibleText - Raw visible text from DOM snapshot
     */
    addPageSummary(url, title, visibleText = '') {
        // Compress the visible text to a brief summary
        const summary = this._compressText(visibleText);

        // De-duplicate: if same URL already exists, update it
        const existing = this.pageSummaries.findIndex(p => p.url === url);
        if (existing !== -1) {
            this.pageSummaries[existing] = { url, title, summary, timestamp: Date.now() };
        } else {
            this.pageSummaries.push({ url, title, summary, timestamp: Date.now() });
        }

        // Evict oldest if over limit
        while (this.pageSummaries.length > MAX_PAGE_SUMMARIES) {
            this.pageSummaries.shift();
        }
    }

    /**
     * Generate an LLM-powered summary for a page (more expensive, better quality).
     * Used only before replanning to get accurate context.
     */
    async addPageSummaryWithLLM(url, title, visibleText) {
        if (!visibleText || visibleText.length < 50) {
            this.addPageSummary(url, title, visibleText);
            return;
        }

        try {
            const prompt = `Summarize this web page in 2-3 sentences. Focus on key content, available actions, and navigation elements relevant to the task "${this.goal}".\n\nPage: ${title} (${url})\nContent: ${visibleText.slice(0, 3000)}`;
            const summary = await CreditGuard.generate(prompt);
            this.addPageSummary(url, title, summary.slice(0, MAX_SUMMARY_CHARS));
        } catch (e) {
            // Fallback to simple compression
            this.addPageSummary(url, title, visibleText);
        }
    }

    // ─── Action Traces ──────────────────────────────────────────────────

    /**
     * Record a completed action. Maintains a sliding window.
     *
     * @param {{ type: string, description?: string, selector?: string, text?: string }} action
     * @param {boolean} success
     * @param {string} [error]
     */
    addAction(action, success = true, error = null) {
        this.actionTraces.push({
            type: action.type,
            description: action.reasoning || action.description || `${action.type} ${action.selector || ''}`,
            success,
            error: error ? error.slice(0, 100) : null,
            timestamp: Date.now(),
        });

        // Sliding window
        while (this.actionTraces.length > MAX_ACTION_TRACES) {
            this.actionTraces.shift();
        }

        // Update task progress
        if (success) {
            this.taskProgress.completedSteps++;
            const milestone = action.reasoning || action.description || action.type;
            if (milestone && milestone.length > 5) {
                this.taskProgress.milestones.push(milestone.slice(0, 100));
                // Keep only last 6 milestones
                if (this.taskProgress.milestones.length > 6) {
                    this.taskProgress.milestones.shift();
                }
            }
        }
    }

    /**
     * Update the current phase.
     */
    setPhase(phase) {
        this.taskProgress.currentPhase = phase;
    }

    // ─── Context Output ─────────────────────────────────────────────────

    /**
     * Build a compact context string for inclusion in LLM prompts.
     * This is the ONLY way the AutonomousLoop should provide history context.
     *
     * @returns {string} Compact context block (typically 800-1500 tokens)
     */
    getCompactContext() {
        const parts = [];

        // Task overview
        parts.push(`## TASK: ${this.goal}`);
        parts.push(`Progress: ${this.taskProgress.completedSteps}/${this.taskProgress.totalPlannedSteps} steps | Phase: ${this.taskProgress.currentPhase}`);

        // Milestones (what was accomplished)
        if (this.taskProgress.milestones.length > 0) {
            parts.push(`\n## ACCOMPLISHED:`);
            this.taskProgress.milestones.forEach((m, i) => {
                parts.push(`  ${i + 1}. ${m}`);
            });
        }

        // Page memory
        if (this.pageSummaries.length > 0) {
            parts.push(`\n## VISITED PAGES:`);
            this.pageSummaries.forEach(p => {
                parts.push(`  - ${p.title} (${p.url}): ${p.summary}`);
            });
        }

        // Recent actions (sliding window)
        if (this.actionTraces.length > 0) {
            parts.push(`\n## RECENT ACTIONS (last ${this.actionTraces.length}):`);
            this.actionTraces.forEach((a, i) => {
                const status = a.success ? 'OK' : `FAIL: ${a.error}`;
                parts.push(`  ${i + 1}. [${status}] ${a.description}`);
            });
        }

        return parts.join('\n');
    }

    /**
     * Get a structured object version (for JSON inclusion in prompts).
     */
    getCompactObject() {
        return {
            goal: this.goal,
            progress: { ...this.taskProgress },
            pageSummaries: this.pageSummaries.map(p => ({
                url: p.url,
                title: p.title,
                summary: p.summary,
            })),
            recentActions: this.actionTraces.slice(-8).map(a => ({
                type: a.type,
                description: a.description,
                success: a.success,
                error: a.error,
            })),
        };
    }

    /**
     * Get stats for monitoring.
     */
    getStats() {
        return {
            pagesRemembered: this.pageSummaries.length,
            actionsRecorded: this.actionTraces.length,
            completedSteps: this.taskProgress.completedSteps,
            milestones: this.taskProgress.milestones.length,
        };
    }

    // ─── Private ────────────────────────────────────────────────────────

    /**
     * Compress visible text into a brief summary without LLM.
     * Strategy: Take first and last chunks, remove whitespace noise.
     */
    _compressText(text) {
        if (!text) return '';
        const cleaned = text.replace(/\s+/g, ' ').trim();
        if (cleaned.length <= MAX_SUMMARY_CHARS) return cleaned;

        // Take first 60% and last 40% of budget
        const firstPart = cleaned.slice(0, Math.floor(MAX_SUMMARY_CHARS * 0.6));
        const lastPart = cleaned.slice(-Math.floor(MAX_SUMMARY_CHARS * 0.35));
        return `${firstPart} [...] ${lastPart}`;
    }
}

// Export singleton
const compactor = new ContextCompactor();
export default compactor;
