/**
 * visualGrounding.js
 * 
 * Implements "Set-of-Marks" (SoM) visual grounding.
 * Injects non-intrusive numeric labels into the page DOM for grounding screenshots.
 * 
 * Key features:
 * - Deterministic numbering of interactive elements.
 * - Minimal DOM pollution (uses a dedicated container & class).
 * - High-contrast, accessibility-aware labels.
 */

const CONTAINER_ID = 'veribrowse-grounding-overlay';
const CLASS_PREFIX = 'vb-grounding-label';

/**
 * Injects numeric labels into all visible interactive elements.
 * @param {import('playwright').Page} page 
 * @returns {Promise<Map<number, string>>} Mapping of label # to a best-guess CSS selector
 */
export async function markPage(page) {
    return await page.evaluate(({ containerId, classPrefix }) => {
        // 1. Cleanup old overlay if exists
        let container = document.getElementById(containerId);
        if (container) container.remove();

        container = document.createElement('div');
        container.id = containerId;
        container.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 2147483647;
        `;
        document.body.appendChild(container);

        // 2. CSS for labels
        const style = document.createElement('style');
        style.innerHTML = `
            .${classPrefix} {
                position: absolute;
                background-color: #ff3e00;
                color: white;
                font-family: 'JetBrains Mono', monospace;
                font-size: 11px;
                font-weight: bold;
                padding: 1px 4px;
                border-radius: 3px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                border: 1px solid white;
                pointer-events: none;
                white-space: nowrap;
                z-index: 2147483647;
                opacity: 0.95;
            }
        `;
        container.appendChild(style);

        // 3. Find candidates
        const candidates = Array.from(document.querySelectorAll(
            'a, button, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [onclick]'
        )).filter(el => {
            const rect = el.getBoundingClientRect();
            // Only mark visible, reasonably sized elements
            return rect.width > 2 && rect.height > 2 &&
                rect.top < window.innerHeight && rect.bottom > 0 &&
                window.getComputedStyle(el).visibility !== 'hidden' &&
                window.getComputedStyle(el).display !== 'none';
        });

        const mapping = {};
        candidates.forEach((el, i) => {
            const labelNum = i + 1;
            const rect = el.getBoundingClientRect();

            const label = document.createElement('div');
            label.className = classPrefix;
            label.innerText = labelNum;

            // Re-calc absolute position considering scroll
            const top = rect.top + window.scrollY;
            const left = rect.left + window.scrollX;

            label.style.top = `${top - 5}px`;
            label.style.left = `${left - 5}px`;

            container.appendChild(label);

            // Generate a selector for this element
            let selector = el.id ? `#${el.id}` : el.tagName.toLowerCase();
            if (el.className && typeof el.className === 'string') {
                const parts = el.className.split(/\s+/).filter(c => c && !c.includes(':')).slice(0, 2);
                if (parts.length) selector += `.${parts.join('.')}`;
            }

            mapping[labelNum] = selector;
        });

        return mapping;
    }, { containerId: CONTAINER_ID, classPrefix: CLASS_PREFIX });
}

/**
 * Removes all visual grounding labels from the page.
 * @param {import('playwright').Page} page 
 */
export async function unmarkPage(page) {
    await page.evaluate((containerId) => {
        const container = document.getElementById(containerId);
        if (container) container.remove();
    }, CONTAINER_ID).catch(() => { });
}
