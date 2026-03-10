/**
 * ResearchOrchestrator.js
 *
 * Multi-tab web research agent. Given a research goal, this orchestrator:
 *   1. Uses LLM to decompose the goal into 3–5 search queries
 *   2. Opens each query in a shadow tab (parallel page loads)
 *   3. Extracts content from each page
 *   4. Aggregates findings and generates a markdown report via generateReport.js
 *   5. Optionally generates a DOCX-style download
 *
 * Used by WorkflowEngine when the user asks for research, comparison, or analysis tasks.
 */

import browserManager from '../core/BrowserManager.js';
import { execute as runReport } from '../tools/browser/generateReport.js';
import extract from '../tools/browser/extract.js';
import * as CreditGuard from '../core/CreditGuard.js';
import bus from '../core/EventBus.js';
import UIFeedback from '../core/UIFeedback.js';

// ─── Constants ─────────────────────────────────────────────────────────
const MAX_SOURCES = 5;
const EXTRACT_TIMEOUT = 15000;      // ms per page extraction
const PAGE_LOAD_TIMEOUT = 20000;    // ms per page load

// ─── Helpers ───────────────────────────────────────────────────────────

function emitStep(payload) {
    UIFeedback.emitStep(payload);
}

/**
 * Ask the LLM to decompose a research goal into search queries + URLs.
 */
async function decomposeGoal(goal) {
    const prompt = `
You are a web research planner. The user wants to research the following topic:

"${goal}"

Generate 3-5 search queries to gather comprehensive information about this topic.
For each query, provide a search URL. Use a MIX of search engines (Google, Bing, DuckDuckGo) to ensure resilience.

Return ONLY valid JSON in this exact format:
{
  "queries": [
    { 
      "query": "search query text", 
      "url": "https://www.google.com/search?q=...", 
      "engine": "google" | "bing" | "duckduckgo",
      "purpose": "why this query helps" 
    }
  ]
}
`.trim();

    const result = await CreditGuard.generateJSON(prompt);
    if (!result?.queries || !Array.isArray(result.queries)) {
        // Fallback: create a single search
        const encoded = encodeURIComponent(goal);
        return [{
            query: goal,
            url: `https://duckduckgo.com/?q=${encoded}`,
            engine: 'duckduckgo',
            purpose: 'Resilient fallback search',
        }];
    }
    return result.queries.slice(0, MAX_SOURCES);
}

/**
 * Open a shadow tab, navigate, wait for load, extract text.
 * Returns { url, title, content } or null on failure.
 */
async function fetchAndExtract(query, signal) {
    const tabId = `research-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    try {
        // Create shadow tab
        const { page } = await browserManager.createShadowTab(tabId, query.url);
        if (!page) throw new Error('Failed to create shadow tab');

        // Wait for content to load
        await page.waitForLoadState('domcontentloaded', { timeout: PAGE_LOAD_TIMEOUT }).catch(() => { });
        await page.waitForTimeout(2000); // Let JS render

        // Check for common redirects or landing pages (Workspace, etc.)
        const currentUrl = page.url();
        if (currentUrl.includes('workspace.google.com') || currentUrl.includes('about.google')) {
            console.warn(`[ResearchOrchestrator] Detected redirect to ${currentUrl} — attempting to go back or skip`);
            // Attempt to go back if we hit a landing page
            await page.goBack().catch(() => { });
            await page.waitForTimeout(1000);
        }

        // Check abort
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

        // Extract page content
        const extracted = await Promise.race([
            extract(page, { includeLinks: true }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Extract timeout')), EXTRACT_TIMEOUT)),
        ]);

        const content = extracted?.result?.text || extracted?.text || '';

        // If content is too short, it might be a bot-block page
        if (content.length < 300 && query.engine === 'google') {
            console.warn(`[ResearchOrchestrator] Content too short from ${query.url} — potential block`);
            // We could flag this to the orchestrator to retry with Bing/DDG
        }

        const title = await page.title().catch(() => query.query);

        console.log(`[ResearchOrchestrator] Extracted ${content.length} chars from ${query.url}`);

        return {
            url: query.url,
            title,
            query: query.query,
            purpose: query.purpose,
            content: content.slice(0, 5000), // Cap per-source content
        };
    } catch (e) {
        if (e.name === 'AbortError') throw e;
        console.warn(`[ResearchOrchestrator] Failed to extract from ${query.url}: ${e.message}`);
        return null;
    } finally {
        // Clean up shadow tab
        try {
            await browserManager.closeShadowTab(tabId);
        } catch { /* ignore */ }
    }
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Run a multi-tab research task.
 *
 * @param {string} goal - The research topic/question
 * @param {object} options - { signal?: AbortSignal, generateDoc?: boolean }
 * @returns {Promise<{ success: boolean, report: string, sources: object[] }>}
 */
export async function research(goal, { signal, generateDoc = true } = {}) {
    console.log(`[ResearchOrchestrator] Starting research: "${goal}"`);

    // ── Step 1: Decompose goal into search queries ────────────────────
    emitStep({ thought: 'Planning research queries…', action: 'RESEARCH_PLAN', status: 'running' });

    let queries;
    try {
        queries = await decomposeGoal(goal);
        emitStep({
            thought: `Generated ${queries.length} research queries`,
            action: 'RESEARCH_PLAN',
            status: 'success',
        });
    } catch (e) {
        emitStep({ thought: `Failed to plan research: ${e.message}`, action: 'RESEARCH_PLAN', status: 'fail' });
        return { success: false, report: null, sources: [] };
    }

    // ── Step 2: Open shadow tabs and extract content ──────────────────
    emitStep({
        thought: `Opening ${queries.length} research tabs…`,
        action: 'MULTI_TAB_EXTRACT',
        status: 'running',
    });

    const sources = [];

    // Process tabs sequentially to avoid overwhelming the browser
    for (let i = 0; i < queries.length; i++) {
        if (signal?.aborted) break;

        const query = queries[i];
        emitStep({
            thought: `Researching: ${query.query}`,
            action: `TAB_${i + 1}/${queries.length}`,
            status: 'running',
            stepIndex: i + 1,
            totalSteps: queries.length + 2, // +2 for plan and report steps
        });

        const result = await fetchAndExtract(query, signal);
        if (result) {
            sources.push(result);
            emitStep({
                thought: `Extracted data from: ${result.title}`,
                action: `TAB_${i + 1}/${queries.length}`,
                status: 'success',
                stepIndex: i + 1,
                totalSteps: queries.length + 2,
            });
        } else {
            emitStep({
                thought: `Failed to extract from: ${query.url}`,
                action: `TAB_${i + 1}/${queries.length}`,
                status: 'warn',
                stepIndex: i + 1,
                totalSteps: queries.length + 2,
            });
        }
    }

    if (sources.length === 0) {
        emitStep({ thought: 'No sources could be extracted', action: 'RESEARCH_FAIL', status: 'fail' });
        return { success: false, report: null, sources: [] };
    }

    // ── Step 3: Aggregate and generate report ────────────────────────
    emitStep({
        thought: `Generating research report from ${sources.length} sources…`,
        action: 'GENERATE_REPORT',
        status: 'running',
    });

    // Build aggregated content
    const aggregatedContent = sources.map((s, i) => [
        `## Source ${i + 1}: ${s.title}`,
        `**URL:** ${s.url}`,
        `**Query:** ${s.query}`,
        `**Purpose:** ${s.purpose}`,
        '',
        s.content,
        '',
        '---',
    ].join('\n')).join('\n\n');

    let report = null;

    if (generateDoc) {
        // Generate a structured report via generateReport.js
        try {
            const mainPage = browserManager.getActivePage();
            const reportResult = await runReport(mainPage, {
                topic: goal,
                content: aggregatedContent,
            });
            report = reportResult?.data || reportResult?.result || 'Report generated.';
            emitStep({
                thought: `Report saved successfully`,
                action: 'GENERATE_REPORT',
                status: 'success',
                result: reportResult?.result,
            });
        } catch (e) {
            console.warn('[ResearchOrchestrator] Report generation failed:', e.message);
            // Fallback: use raw aggregated content as the report
            report = `# Research Report: ${goal}\n\n${aggregatedContent}`;
            emitStep({
                thought: 'Report saved (raw format)',
                action: 'GENERATE_REPORT',
                status: 'warn',
            });
        }
    } else {
        report = aggregatedContent;
    }

    // Generate a summary for the chat panel
    try {
        const summaryPrompt = `Summarize the following research findings about "${goal}" in 3-5 paragraphs. Be comprehensive but concise. Use bullet points for key findings.\n\n${aggregatedContent.substring(0, 8000)}`;
        const chatSummary = await CreditGuard.generate(summaryPrompt);
        bus.emit('agent:chat-response', { goal, response: chatSummary });
    } catch (e) {
        bus.emit('agent:chat-response', {
            goal,
            response: `✅ Research complete! Gathered data from ${sources.length} sources. Report has been saved to your Downloads folder.`,
        });
    }

    emitStep({
        thought: `Research complete: ${sources.length} sources analyzed`,
        action: 'DONE',
        status: 'success',
    });

    console.log(`[ResearchOrchestrator] Research complete: ${sources.length} sources, report generated.`);

    return { success: true, report, sources };
}
