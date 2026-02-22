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
    // Use string-based evaluate so Babel never injects webpack polyfill references
    // into code that runs in the browser page sandbox.
    const script = `(function(containerId, classPrefix) {
        // Guard: body not ready yet — return empty map
        if (!document.body) return {};

        var container = document.getElementById(containerId);
        if (container) container.parentNode.removeChild(container);

        container = document.createElement('div');
        container.id = containerId;
        container.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483647;';
        document.body.appendChild(container);

        var style = document.createElement('style');
        style.innerHTML = '.' + classPrefix + '{position:absolute;background-color:#ff3e00;color:white;font-family:monospace;font-size:11px;font-weight:bold;padding:1px 4px;border-radius:3px;box-shadow:0 2px 4px rgba(0,0,0,0.3);border:1px solid white;pointer-events:none;white-space:nowrap;z-index:2147483647;opacity:0.95;}';
        container.appendChild(style);

        var elements = document.querySelectorAll('a,button,input,select,textarea,[role="button"],[role="link"],[role="checkbox"],[onclick]');
        var candidates = [];
        for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            var rect = el.getBoundingClientRect();
            var st = window.getComputedStyle(el);
            if (rect.width > 2 && rect.height > 2 &&
                rect.top < window.innerHeight && rect.bottom > 0 &&
                st.visibility !== 'hidden' && st.display !== 'none') {
                candidates.push(el);
            }
        }

        var mapping = {};
        for (var j = 0; j < candidates.length; j++) {
            var ec = candidates[j];
            var num = j + 1;
            var cr = ec.getBoundingClientRect();

            var lbl = document.createElement('div');
            lbl.className = classPrefix;
            lbl.innerText = num;
            lbl.style.top  = (cr.top  + window.scrollY - 5) + 'px';
            lbl.style.left = (cr.left + window.scrollX - 5) + 'px';
            container.appendChild(lbl);

            var sel = ec.id ? '#' + ec.id : ec.tagName.toLowerCase();
            if (ec.className && typeof ec.className === 'string') {
                var parts = ec.className.split(' ');
                var valid = [];
                for (var k = 0; k < parts.length; k++) {
                    var p = parts[k];
                    if (p && p.charAt(0) !== ':' && p.indexOf(':') === -1) valid.push(p);
                    if (valid.length >= 2) break;
                }
                if (valid.length > 0) sel += '.' + valid.join('.');
            }
            mapping[num] = sel;
        }
        return mapping;
    })(${JSON.stringify(CONTAINER_ID)}, ${JSON.stringify(CLASS_PREFIX)})`;
    return await page.evaluate(script);
}

/**
 * Removes all visual grounding labels from the page.
 * @param {import('playwright').Page} page 
 */
export async function unmarkPage(page) {
    await page.evaluate(`
        var el = document.getElementById(${JSON.stringify(CONTAINER_ID)});
        if (el && el.parentNode) el.parentNode.removeChild(el);
    `).catch(() => { });
}
