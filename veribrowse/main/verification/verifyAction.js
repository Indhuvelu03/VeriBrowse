/**
 * verifyAction.js
 *
 * Compares before/after DOM snapshots to determine whether an action
 * had any meaningful effect. Used by the browserAgentLoop to detect
 * stuck states and trigger recovery.
 */

export default function verifyAction(before, after, action) {
    const b = before || {};
    const a = after  || {};

    // ── URL change ──
    const urlChanged = (b.url || '') !== (a.url || '');

    // ── Visible text change (page content shifted) ──
    const domChanged = (b.visibleText || '') !== (a.visibleText || '');

    // ── Scroll position changed ──
    const scrollChanged =
        (b.scrollPosition?.x !== a.scrollPosition?.x) ||
        (b.scrollPosition?.y !== a.scrollPosition?.y);

    // ── Targeted element visibility change ──
    let elementChanged = false;
    if (action?.selector) {
        const bElem = (b.interactiveElements || []).find(e => e.selector === action.selector);
        const aElem = (a.interactiveElements || []).find(e => e.selector === action.selector);
        elementChanged = (bElem?.visible !== aElem?.visible);
    }

    // ── Overlay detection ──
    const bOverlays = (b.overlays || []).length;
    const aOverlays = (a.overlays || []).length;
    const overlayAppeared    = aOverlays > bOverlays;
    const overlayDisappeared = aOverlays < bOverlays;

    // ── Input value change (after TYPE) ──
    let inputChanged = false;
    if (action?.type === 'TYPE' && action?.selector) {
        const bInput = (b.inputs || []).find(i => i.selector === action.selector);
        const aInput = (a.inputs || []).find(i => i.selector === action.selector);
        inputChanged = (bInput?.value !== aInput?.value);
    }

    // Combined success: any meaningful change counts
    const success = urlChanged || domChanged || scrollChanged ||
                    elementChanged || overlayAppeared || overlayDisappeared || inputChanged;

    return {
        urlChanged,
        domChanged,
        scrollChanged,
        elementChanged,
        inputChanged,
        overlayAppeared,
        overlayDisappeared,
        success,
    };
}
