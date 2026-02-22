/**
 * humanTiming.js
 *
 * Centralized timing helpers for all human-like interaction behaviour.
 *
 * WHY this exists:
 *   Real humans do not act at machine speed. Every action has microsecond
 *   hesitation, muscle-memory variance, and cognitive "intent" delays.
 *   Uniform zero-delay automation is instantly detectable (and feels robotic
 *   in screen recordings). This module makes every action feel intentional.
 *
 * All exported helpers return Promises — use with `await`.
 */

// ─── Core random helpers ──────────────────────────────────────────────────

/**
 * Resolve after a random millisecond delay within [min, max].
 * The workhorse of everything else in this module.
 *
 * @param {number} min - minimum milliseconds
 * @param {number} max - maximum milliseconds
 */
export function randomDelay(min, max) {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(r => setTimeout(r, ms));
}

/**
 * Return a random integer in [min, max] (inclusive).
 * Useful for computing jitter offsets without awaiting.
 */
export function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Return a small floating-point offset — models "imperfect aim".
 * Used to add imperceptible variance to cursor landing positions.
 *
 * @param {number} magnitude - max offset in pixels (default 4)
 */
export function naturalJitter(magnitude = 4) {
    return {
        dx: (Math.random() * 2 - 1) * magnitude,
        dy: (Math.random() * 2 - 1) * magnitude,
    };
}

// ─── Semantic pause categories ────────────────────────────────────────────
// Each pause maps to a real human cognitive/motor state.

/**
 * microPause — the gap between keystrokes or incremental mouse steps.
 * Models: hand tremor, key travel, finger lift.
 * Duration: 20–70 ms
 */
export async function microPause() {
    return randomDelay(20, 70);
}

/**
 * hoverPause — time between cursor landing on an element and clicking.
 * Models: visual confirmation ("yes, this is the right button").
 * Duration: 80–240 ms
 */
export async function hoverPause() {
    return randomDelay(80, 240);
}

/**
 * hesitation — pause before a significant action (form submit, filter apply).
 * Models: "let me make sure this is right" cognitive check.
 * Duration: 300–800 ms
 */
export async function hesitation() {
    return randomDelay(300, 800);
}

/**
 * actionCooldown — settle time AFTER an action before starting the next.
 * Models: waiting for perception feedback (did the click register?), DOM settle.
 * Duration: 150–450 ms
 */
export async function actionCooldown() {
    return randomDelay(150, 450);
}

/**
 * charDelay — pause between individual keystrokes while typing.
 * Models: finger travel + cognitive rhythm.
 * Occasionally draws from a "slow" range to simulate thinking mid-word.
 * Duration: 35–110 ms (with 15% chance of a 200–400 ms "thinking gap")
 */
export async function charDelay() {
    // 1-in-7 chance of a longer "thinking" pause between characters
    if (Math.random() < 0.14) {
        return randomDelay(200, 400);
    }
    return randomDelay(35, 110);
}

/**
 * mouseStepDelay — pause between each small mouse movement increment.
 * Shorter = faster cursor, longer = slower/more deliberate cursor.
 * Duration: 6–18 ms
 */
export async function mouseStepDelay() {
    return randomDelay(6, 18);
}

/**
 * pageLoadSettle — wait for a page to visually stabilise after navigation.
 * Models: scanning the newly loaded page before acting.
 * Duration: 400–900 ms
 */
export async function pageLoadSettle() {
    return randomDelay(400, 900);
}

/**
 * scrollStepDelay — pause between individual scroll increments.
 * Smaller values = faster scroll, larger = deliberate reading scroll.
 * Duration: 20–55 ms
 */
export async function scrollStepDelay() {
    return randomDelay(20, 55);
}

// ─── Easing helpers ───────────────────────────────────────────────────────

/**
 * easeInOut — maps a value t ∈ [0,1] using a smooth cubic curve.
 * Used for natural speed ramp-up and ramp-down during movement.
 *
 * @param {number} t  - progress fraction in [0, 1]
 * @returns {number}  - eased value in [0, 1]
 */
export function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}
