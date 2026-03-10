/**
 * fillForm.js
 *
 * High-level form filler: locates a form (by selector or role) and fills
 * multiple fields in a single step. Enhanced for complex booking scenarios
 * including date pickers, autocomplete dropdowns, and multi-step forms.
 * ZERO LLM calls.
 *
 * params:
 *   formSelector  {string}         CSS selector of the <form> element (optional — fills on whole page if omitted)
 *   fields        {Array<{selector, value, type?}>}  List of {selector, value, type?} pairs to fill
 *   submit        {boolean}        If true, clicks the first [type=submit] button after filling
 *   submitSelector {string}        Custom selector for submit button (overrides default)
 */

export default async function fillForm(page, params = {}) {
    const {
        formSelector = null,
        fields = [],
        submit = false,
        submitSelector = null,
    } = params;

    try {
        if (!fields || fields.length === 0) {
            throw new Error('fillForm requires a non-empty "fields" array.');
        }

        console.log(`[Tool:FillForm] Filling ${fields.length} field(s)${formSelector ? ` in "${formSelector}"` : ''}`);

        // Use the form as a scoped locator, or the full page
        const root = formSelector ? page.locator(formSelector) : page;

        for (const { selector, value, type: fieldHint } of fields) {
            if (!selector || value === undefined) {
                console.warn('[Tool:FillForm] Skipping field with missing selector or value:', { selector, value });
                continue;
            }

            const field = root.locator(selector).first();

            // Determine field type for the most reliable fill strategy
            const tagName = await field.evaluate((el) => el.tagName.toLowerCase()).catch(() => 'input');
            const inputType = await field.evaluate((el) => el.type?.toLowerCase() || '').catch(() => '');

            // ── SELECT / DROPDOWN ────────────────────────────────────────
            if (tagName === 'select') {
                await field.selectOption({ label: value }).catch(() => field.selectOption(value));

                // ── CHECKBOX ─────────────────────────────────────────────────
            } else if (inputType === 'checkbox') {
                if (value === true || value === 'true' || value === 1) {
                    await field.check();
                } else {
                    await field.uncheck();
                }

                // ── RADIO ────────────────────────────────────────────────────
            } else if (inputType === 'radio') {
                await field.check();

                // ── DATE INPUT ───────────────────────────────────────────────
                // Date pickers are tricky — fill natively if possible, otherwise
                // inject the value directly to bypass calendar widgets.
            } else if (inputType === 'date' || fieldHint === 'date') {
                try {
                    // Try native fill first (works for <input type="date">)
                    await field.fill(String(value));
                } catch {
                    // Fallback: set value via JS to bypass custom date pickers
                    await field.evaluate((el, val) => {
                        const nativeSetter = Object.getOwnPropertyDescriptor(
                            window.HTMLInputElement.prototype, 'value'
                        ).set;
                        nativeSetter.call(el, val);
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }, String(value));
                }

                // ── AUTOCOMPLETE FIELD ───────────────────────────────────────
                // Type slowly and wait for dropdown suggestions, then pick the match.
            } else if (fieldHint === 'autocomplete') {
                await field.click({ clickCount: 3 }); // select all existing text
                // Type character by character with delays to trigger autocomplete
                await field.pressSequentially(String(value), { delay: 80 });
                // Wait for autocomplete dropdown to appear
                await page.waitForTimeout(1200);
                // Try to click the matching suggestion
                try {
                    const suggestion = page.locator(`[role="option"], [role="listbox"] li, .autocomplete-suggestion, .suggestion-item, .pac-item`)
                        .filter({ hasText: new RegExp(value.split(' ')[0], 'i') })
                        .first();
                    if (await suggestion.isVisible({ timeout: 2000 })) {
                        await suggestion.click();
                        console.log(`[Tool:FillForm] Clicked autocomplete suggestion for "${value}"`);
                    }
                } catch {
                    // No autocomplete dropdown found — the typed value may be enough
                    console.log(`[Tool:FillForm] No autocomplete dropdown for "${value}" — using typed text`);
                }

                // ── TEXT / EMAIL / PASSWORD / TEXTAREA ────────────────────────
            } else {
                await field.click({ clickCount: 3 }); // select all existing text
                await field.fill(String(value));
            }

            console.log(`[Tool:FillForm] Filled "${selector}" with "${String(value).slice(0, 40)}"`);
            await page.waitForTimeout(200); // brief delay between fields
        }

        // Optionally submit the form
        if (submit) {
            const btnSelector = submitSelector || '[type="submit"], button[type="submit"], input[type="submit"]';
            const submitBtn = (formSelector ? page.locator(formSelector) : page)
                .locator(btnSelector)
                .first();

            await submitBtn.click({ timeout: 5000 });
            console.log('[Tool:FillForm] Submitted form.');

            // Wait for navigation / response after submit
            await page.waitForTimeout(1500);
        }

        return {
            success: true,
            result: { fieldsCount: fields.length, submitted: submit },
            error: null,
        };
    } catch (err) {
        console.error('[Tool:FillForm] Failed:', err.message);
        return {
            success: false,
            result: null,
            error: err.message,
        };
    }
}
