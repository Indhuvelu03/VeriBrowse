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
 * ZERO LLM calls.
 */

import InteractionEngine from '../../interaction/interactionEngine.js';
import extract from './extract.js';

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

export default async function executeAction(action, page) {
    switch (action.type) {

        // ── CLICK ──────────────────────────────────────────────────────
        case 'CLICK': {
            const result = await InteractionEngine.execute(page, {
                type:     'click',
                selector: action.selector || null,
                text:     action.text     || null,
                // Treat clicks with no selector as less predictable → not fast
                fast:     !!action.selector,
                // Important clicks (destructive, confirmation): any button with
                // submit / apply / buy / continue semantics
                important: /submit|apply|confirm|buy|checkout|continue|accept/i
                    .test(action.text || action.selector || ''),
            });

            if (!result.success) {
                throw new Error(result.error || `CLICK failed — selector: "${action.selector}", text: "${action.text}"`);
            }

            // Wait for potential navigation after click
            await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});

            // Auth submits often redirect asynchronously after XHR; give them extra settle time.
            const clickIntent = `${action.text || ''} ${action.reasoning || ''} ${action.goalText || ''} ${action.selector || ''}`;
            if (/\b(log\s*in|login|sign\s*in|signin|submit)\b/i.test(clickIntent)) {
                await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
                await page.waitForTimeout(rand(900, 1600));
            }
            break;
        }

        // ── TYPE ───────────────────────────────────────────────────────
        case 'TYPE': {
            const result = await InteractionEngine.execute(page, {
                type:        'type',
                selector:    action.selector || null,
                text:        action.text || '',
                fieldHint:   action.fieldHint || action.goalText || action.reasoning || null,
                clear:       true,
                pressEnter:  action.pressEnter || action.text?.endsWith('\n') || false,
                waitAfter:   rand(800, 1600),
                moveCursor:  true,
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
            let dir    = action.direction || 'down';

            // Handle special string directions from planner
            if (dir === 'top')    { amount = 'top';    dir = 'up'; }
            if (dir === 'bottom') { amount = 'full';   dir = 'down'; }

            await InteractionEngine.execute(page, {
                type:      'scroll',
                direction: dir,
                amount,
                selector:  action.selector || null,
                // Use 'read' profile if agent is explicitly reading / extracting
                profile:   action.profile || 'skim',
            });
            break;
        }

        // ── NAVIGATE ───────────────────────────────────────────────────
        case 'NAVIGATE': {
            await InteractionEngine.execute(page, {
                type: 'navigate',
                url:  action.url,
            });
            break;
        }

        // ── PRESS_ENTER (convenience wrapper) ─────────────────────────
        case 'PRESS_ENTER': {
            await page.keyboard.press('Enter');
            await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
            await page.waitForTimeout(rand(500, 1000));
            break;
        }

        // ── WAIT ───────────────────────────────────────────────────────
        case 'WAIT': {
            await InteractionEngine.execute(page, {
                type:   'wait',
                amount: action.amount || rand(1200, 2500),
            });
            break;
        }

        // ── EXTRACT ────────────────────────────────────────────────────
        // Capture page text so AutonomousLoop can surface it as the step result
        case 'EXTRACT': {
            try {
                const extracted = await extract(page, { includeLinks: false });
                // Mutate action so AutonomousLoop's executedSteps picks it up
                if (extracted && extracted.text) {
                    action.result = extracted.text.slice(0, 1500);
                }
            } catch (e) {
                console.warn('[executeAction:EXTRACT] Failed to extract page text:', e.message);
            }
            break;
        }

        // ── Unknown → throw so AutonomousLoop counts it as failure ─────
        default:
            if (action.type !== 'DONE') {
                throw new Error(`Unknown action type: ${action.type}`);
            }
    }
}
