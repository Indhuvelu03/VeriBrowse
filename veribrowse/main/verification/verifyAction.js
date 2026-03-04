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

    // ── EXTRACT always succeeds if it completed ──
    // EXTRACT is a read-only operation — it doesn't change the DOM.
    // If executeAction didn't throw, the extraction worked.
    if (action?.type === 'EXTRACT') {
        return {
            success: true,
            extractCompleted: true,
        };
    }

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
    if (action?.type === 'TYPE') {
        // Check exact selector match first
        if (action?.selector) {
            const bInput = (b.inputs || []).find(i => i.selector === action.selector);
            const aInput = (a.inputs || []).find(i => i.selector === action.selector);
            inputChanged = (bInput?.value !== aInput?.value);
        }
        
        // Also check if ANY input on the page changed (for custom widgets like
        // Google Flights where the actual input selector is different from planned)
        if (!inputChanged) {
            const bValues = (b.inputs || []).map(i => i.value || '').join('\x00');
            const aValues = (a.inputs || []).map(i => i.value || '').join('\x00');
            inputChanged = bValues !== aValues;
        }
        
        // Check for text appearance in visible content (for custom autocomplete
        // widgets that don't use standard input elements)
        if (!inputChanged && action?.text) {
            const typedText = action.text.toLowerCase().trim();
            const bHasText = (b.visibleText || '').toLowerCase().includes(typedText);
            const aHasText = (a.visibleText || '').toLowerCase().includes(typedText);
            // Text newly appeared after typing
            if (!bHasText && aHasText) inputChanged = true;
        }
        
        // Check if a dropdown/suggestions list appeared (autocomplete trigger)
        const bListboxes = ((b.visibleText || '').match(/aria-live|listbox|dropdown|suggestions?|autocomplete/gi) || []).length;
        const aListboxes = ((a.visibleText || '').match(/aria-live|listbox|dropdown|suggestions?|autocomplete/gi) || []).length;
        if (aListboxes > bListboxes) inputChanged = true;
    }

    // ── Any input value changed (after CLICK that fills an autocomplete/combobox field) ──
    // When an autocomplete suggestion is clicked, the associated input value changes even
    // though the click target is the suggestion item, not the input itself.
    let anyInputFilled = false;
    let suggestionSelected = false;
    if (action?.type === 'CLICK') {
        const bValues = (b.inputs || []).map(i => i.value || '').join('\x00');
        const aValues = (a.inputs || []).map(i => i.value || '').join('\x00');
        anyInputFilled = bValues !== aValues;
        
        // Check if the clicked text now appears in any input value
        // (autocomplete suggestion selection pattern)
        if (!anyInputFilled && action?.text) {
            const clickText = action.text.toLowerCase().trim();
            const aInputValues = (a.inputs || []).map(i => (i.value || '').toLowerCase());
            // Check if any input now contains the clicked text
            if (aInputValues.some(v => v.includes(clickText) || clickText.includes(v))) {
                suggestionSelected = true;
            }
        }
        
        // Check for dropdown/modal closure (common after selecting autocomplete suggestion)
        // If overlays decreased OR interactive elements count dropped significantly,
        // the click likely closed a dropdown
        const bInteractive = (b.interactiveElements || []).length;
        const aInteractive = (a.interactiveElements || []).length;
        if (bInteractive > aInteractive + 3) {
            // Many interactive elements removed = dropdown closed
            suggestionSelected = true;
        }
    }

    // Combined success: any meaningful change counts
    const success = urlChanged || domChanged || scrollChanged ||
                    elementChanged || overlayAppeared || overlayDisappeared ||
                    inputChanged || anyInputFilled || suggestionSelected;

    return {
        urlChanged,
        domChanged,
        scrollChanged,
        elementChanged,
        inputChanged,
        anyInputFilled,
        suggestionSelected,
        overlayAppeared,
        overlayDisappeared,
        success,
    };
}
