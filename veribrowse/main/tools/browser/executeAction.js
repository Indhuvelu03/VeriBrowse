/**
 * executeAction.js
 *
 * Executes a single atomic action (ACTION_SCHEMA) on the page.
 *
 * ─── Architecture ────────────────────────────────────────────────────────
 * This file is the adapter between AutonomousLoop's action schema and the
 * human-like InteractionEngine. Every action that involves user-visible
 * interaction (click, type, scroll, navigate) is routed through the engine
 * so the cursor overlay, timing system, and trajectory physics are applied
 * consistently WITHOUT changing AutonomousLoop's calling contract.
 *
 * Interface is unchanged: executeAction(action, page)
 * ZERO LLM
 */

import InteractionEngine from '../../interaction/interactionEngine.js';
import extract from './extract.js';
// Additional Actions
import * as screenshotAction from './screenshot.js';
import * as syncSessionAction from './syncSession.js';
import * as generateReportAction from './generateReport.js';

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

export default async function executeAction(action, page) {
    switch (action.type) {

        // ── CLICK ──────────────────────────────────────────────────────
        case 'CLICK': {
            const result = await InteractionEngine.execute(page, {
                type: 'click',
                selector: action.selector || null,
                text: action.text || null,
                // Treat clicks with no selector as less predictable → not fast
                fast: !!action.selector,
                // Important clicks (destructive, confirmation): any button with
                // submit / apply / buy / continue semantics
                important: /submit|apply|confirm|buy|checkout|continue|accept/i
                    .test(action.text || action.selector || ''),
            });

            if (!result.success) {
                throw new Error(result.error || `CLICK failed — selector: "${action.selector}", text: "${action.text}"`);
            }
<<<<<<< Updated upstream
            // Navigation wait is handled inside humanClickElement (smart race).
            // No second waitForLoadState here — that was an 8s penalty on every click.
=======

            // Wait for potential navigation after click
            await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => { });

            // Auth submits often redirect asynchronously after XHR; give them extra settle time.
            const clickIntent = `${action.text || ''} ${action.reasoning || ''} ${action.goalText || ''} ${action.selector || ''}`;
            if (/\b(log\s*in|login|sign\s*in|signin|submit)\b/i.test(clickIntent)) {
                await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });
                await page.waitForTimeout(rand(900, 1600));
            }
>>>>>>> Stashed changes
            break;
        }

        // ── TYPE ───────────────────────────────────────────────────────
        case 'TYPE': {
            const result = await InteractionEngine.execute(page, {
<<<<<<< Updated upstream
                type:        'type',
                selector:    action.selector || null,
                text:        action.text || '',
                clear:       true,
                pressEnter:  action.pressEnter || action.text?.endsWith('\n') || false,
                waitAfter:   rand(800, 1600),
                moveCursor:  true,
=======
                type: 'type',
                selector: action.selector || null,
                text: action.text || '',
                fieldHint: action.fieldHint || action.goalText || action.reasoning || null,
                clear: true,
                pressEnter: action.pressEnter || action.text?.endsWith('\n') || false,
                waitAfter: rand(800, 1600),
                moveCursor: true,
>>>>>>> Stashed changes
            });

            if (!result.success) {
                throw new Error(`TYPE failed — could not focus any input field`);
            }
            break;
        }

        // ── SCROLL ─────────────────────────────────────────────────────
        case 'SCROLL': {
            // Map AutonomousLoop's scroll descriptor to InteractionEngine
            let amount = action.amount || 'screen';
            let dir = action.direction || 'down';

            // Handle special string directions from planner
            if (dir === 'top') { amount = 'top'; dir = 'up'; }
            if (dir === 'bottom') { amount = 'full'; dir = 'down'; }

            await InteractionEngine.execute(page, {
                type: 'scroll',
                direction: dir,
                amount,
                selector: action.selector || null,
                // Use 'read' profile if agent is explicitly reading / extracting
                profile: action.profile || 'skim',
            });
            break;
        }

        // ── NAVIGATE ───────────────────────────────────────────────────
        case 'NAVIGATE': {
            await InteractionEngine.execute(page, {
                type: 'navigate',
                url: action.url,
            });
            break;
        }

        // ── PRESS_ENTER (convenience wrapper) ─────────────────────────
        case 'PRESS_ENTER': {
            await page.keyboard.press('Enter');
<<<<<<< Updated upstream
            // ENHANCED: Better handling for SPA navigation
            // SPAs (React, Angular, Vue) don't trigger waitForNavigation — they update content dynamically.
            // Use a combination approach:
            // 1. Try to wait for navigation (true page reload)
            // 2. Meanwhile, wait for common indicators of page state changes (DOM mutations, network quiet)
            // 3. Fall back to longer wait if neither happens
            let navigationHappened = false;
            try {
                await Promise.race([
                    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 2000 })
                        .then(() => { navigationHappened = true; }),
                    page.waitForTimeout(100).then(() => {
                        // After 100ms, check if network is idle (good indicator for SPA content load)
                        return page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
                    })
                ]);
            } catch (e) {
                // Navigation timeout — assume SPA content update, wait longer
                navigationHappened = false;
            }

            // If no navigation detected, wait for SPA render
            if (!navigationHappened) {
                await page.waitForTimeout(rand(1200, 2500)); // SPA render time
            } else {
                await page.waitForTimeout(rand(300, 700)); // Page load settle
            }
=======
            await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => { });
            await page.waitForTimeout(rand(500, 1000));
>>>>>>> Stashed changes
            break;
        }

        // ── WAIT ───────────────────────────────────────────────────────
        case 'WAIT': {
            await InteractionEngine.execute(page, {
                type: 'wait',
                amount: action.amount || rand(1200, 2500),
            });
            break;
        }

        case 'syncSession':
            return await syncSessionAction.execute(page);

        case 'generateReport':
            // The existing GENERATE_REPORT case already handles this.
            // This new case seems to be for a different contract or a refactor.
            // Assuming `action` contains the necessary parameters for `generateReportAction.execute`.
            // If `params` is intended, it needs to be passed into `executeAction` or derived from `action`.
            // For now, mapping `action` to `params` as best as possible.
            return await generateReportAction.execute(page, {
                topic: action.topic,
                content: action.content,
                filePath: action.filePath, // Assuming filePath might be a parameter
            });

        // ── EXTRACT ────────────────────────────────────────────────────
        // Capture page text so AutonomousLoop can surface it as the step result
        case 'EXTRACT': {
            try {
                const extracted = await extract(page, { includeLinks: false });
                // Mutate action so AutonomousLoop's executedSteps picks it up
                // extract() returns { success, result: { text, links, wordCount }, error }
                if (extracted && extracted.result && extracted.result.text) {
                    action.result = extracted.result.text.slice(0, 5000);
                }
            } catch (e) {
                console.warn('[executeAction:EXTRACT] Failed to extract page text:', e.message);
            }
            break;
        }

<<<<<<< Updated upstream
        // ── SELECT ─────────────────────────────────────────────────────
        // Handles native HTML <select> dropdowns (passenger count, class, etc.)
        case 'SELECT': {
            const selector = action.selector;
            const value = action.value || action.text || '';
            if (!selector) throw new Error('SELECT failed — no selector provided');

            // Try by visible label first (what the user sees), then by value attribute
            const succeeded = await page.selectOption(selector, { label: value }).catch(async () => {
                await page.selectOption(selector, { value });
            }).then(() => true).catch(() => false);

            if (!succeeded) {
                throw new Error(`SELECT failed — could not select "${value}" in "${selector}"`);
            }
            await page.waitForTimeout(rand(400, 800));
=======
        // ── SUSPEND (HITL) ─────────────────────────────────────────────
        case 'suspend': {
            const reason = action.reason || action.description || 'Agent needs your help to continue.';
            console.log(`[executeAction:suspend] Pausing for HITL: ${reason}`);
            // Emit via EventBus so the renderer shows the HITL card
            const bus = (await import('../../core/EventBus.js')).default;
            bus.emit('agent:needs-human', { reason });
            action.result = `Paused: ${reason}`;
            // AutonomousLoop's waitForResume will block until user clicks Resume
            break;
        }

        // ── ACCESS_VAULT ───────────────────────────────────────────────
        case 'accessVault': {
            const VaultService = (await import('../../services/VaultService.js')).default;
            const val = VaultService.get(action.key);
            if (val) {
                action.result = val;
            } else {
                throw new Error(`Vault entry for "${action.key}" not found.`);
            }
            break;
        }

        // ── GENERATE_REPORT ────────────────────────────────────────────
        case 'generateReport': {
            try {
                const { execute: runReport } = await import('./generateReport.js');
                const reportResult = await runReport(page, {
                    topic: action.topic || action.params?.topic || 'Report',
                    content: action.content || action.params?.content || '',
                });
                action.result = reportResult?.result || 'Report generated.';
            } catch (e) {
                throw new Error(`[executeAction:generateReport] Failed: ${e.message}`);
            }
>>>>>>> Stashed changes
            break;
        }

        // ── Unknown → throw so AutonomousLoop counts it as failure ─────
        default:
            if (action.type !== 'DONE') {
                throw new Error(`Unknown action type: ${action.type}`);
            }
    }
}
