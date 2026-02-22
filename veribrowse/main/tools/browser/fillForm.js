/**
 * fillForm.js
 *
 * High-level form filler: locates a form (by selector or role) and fills
 * multiple fields in a single step. Much more reliable than chaining individual
 * type() calls because it queries the DOM structure once.
 * ZERO LLM calls.
 *
 * params:
 *   formSelector  {string}         CSS selector of the <form> element (optional — fills on whole page if omitted)
 *   fields        {Array<{selector, value}>}  List of {selector, value} pairs to fill
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

        for (const { selector, value } of fields) {
            if (!selector || value === undefined) {
                console.warn('[Tool:FillForm] Skipping field with missing selector or value:', { selector, value });
                continue;
            }

            const field = root.locator(selector).first();

            // Determine field type for the most reliable fill strategy
            const tagName = await field.evaluate((el) => el.tagName.toLowerCase()).catch(() => 'input');
            const inputType = await field.evaluate((el) => el.type?.toLowerCase() || '').catch(() => '');

            if (tagName === 'select') {
                await field.selectOption({ label: value }).catch(() => field.selectOption(value));
            } else if (inputType === 'checkbox') {
                if (value === true || value === 'true' || value === 1) {
                    await field.check();
                } else {
                    await field.uncheck();
                }
            } else if (inputType === 'radio') {
                await field.check();
            } else {
                // Text / email / password / textarea — clear then fill
                await field.click({ clickCount: 3 }); // select all existing text
                await field.fill(String(value));
            }

            console.log(`[Tool:FillForm] Filled "${selector}" with "${String(value).slice(0, 40)}"`);
            await page.waitForTimeout(150); // brief delay between fields to avoid race conditions
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
