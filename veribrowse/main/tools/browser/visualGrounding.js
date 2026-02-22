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
        var container = document.getElementById(containerId);
        if (container) container.remove();

        container = document.createElement('div');
        container.id = containerId;
        container.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2147483647;';
        document.body.appendChild(container);

        // 2. CSS for labels
        var style = document.createElement('style');
        style.innerHTML = '.' + classPrefix + ' { ' +
            'position: absolute; background-color: #ff3e00; color: white; ' +
            'font-family: "JetBrains Mono", monospace; font-size: 11px; ' +
            'font-weight: bold; padding: 1px 4px; border-radius: 3px; ' +
            'box-shadow: 0 2px 4px rgba(0,0,0,0.3); border: 1px solid white; ' +
            'pointer-events: none; white-space: nowrap; z-index: 2147483647; opacity: 0.95; ' +
            '}';
        container.appendChild(style);

        // 3. Find candidates (avoid Array.from/filter/forEach to prevent Babel polyfill errors)
        var elements = document.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [onclick]');
        var candidates = [];
        for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            var rect = el.getBoundingClientRect();
            var styleObj = window.getComputedStyle(el);
            if (rect.width > 2 && rect.height > 2 &&
                rect.top < window.innerHeight && rect.bottom > 0 &&
                styleObj.visibility !== 'hidden' &&
                styleObj.display !== 'none') {
                candidates.push(el);
            }
        }

        var mapping = {};
        for (var j = 0; j < candidates.length; j++) {
            var elCandidate = candidates[j];
            var labelNum = j + 1;
            var cRect = elCandidate.getBoundingClientRect();

            var label = document.createElement('div');
            label.className = classPrefix;
            label.innerText = labelNum;

            var top = cRect.top + window.scrollY;
            var left = cRect.left + window.scrollX;

            label.style.top = (top - 5) + 'px';
            label.style.left = (left - 5) + 'px';

            container.appendChild(label);

            // Generate a selector
            var selector = elCandidate.id ? '#' + elCandidate.id : elCandidate.tagName.toLowerCase();
            if (elCandidate.className && typeof elCandidate.className === 'string') {
                var classParts = elCandidate.className.split(/\s+/);
                var validClasses = [];
                for (var k = 0; k < classParts.length; k++) {
                    if (classParts[k] && classParts[k].indexOf(':') === -1) {
                        validClasses.push(classParts[k]);
                    }
                }
                if (validClasses.length > 0) {
                    selector += '.' + validClasses.slice(0, 2).join('.');
                }
            }
            mapping[labelNum] = selector;
        }

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
