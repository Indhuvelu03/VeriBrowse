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

    function asText(...parts) {
        return parts.filter(Boolean).join(' ').toLowerCase();
    }

    function isLoginLikeUrl(url) {
        return /(?:login|log[_-]?in|sign[_-]?in|auth|account\/login|session)/i.test(url || '');
    }

    function hasVisiblePasswordInput(snap) {
        return (snap?.inputs || []).some((i) => {
            if (i?.visible === false) return false;
            const blob = asText(i?.type, i?.name, i?.autocomplete, i?.placeholder, i?.ariaLabel, i?.selector);
            return /\b(password|passcode|pwd|pin)\b/.test(blob);
        });
    }

    function hasLoggedInIndicators(snap) {
        const blob = asText(snap?.title, snap?.visibleText);
        return /\b(log\s*out|logout|sign\s*out|my account|dashboard|profile|workspace)\b/.test(blob);
    }

    // EXTRACT does not necessarily mutate DOM/URL. Success is based on captured text.
    if (action?.type === 'EXTRACT') {
        const extractedText = typeof action?.result === 'string' ? action.result.trim() : '';
        const success = extractedText.length > 0;
        return {
            urlChanged: false,
            domChanged: false,
            scrollChanged: false,
            elementChanged: false,
            inputChanged: false,
            overlayAppeared: false,
            overlayDisappeared: false,
            extractedChars: extractedText.length,
            success,
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
    if (action?.type === 'TYPE' && action?.selector) {
        const bInput = (b.inputs || []).find(i => i.selector === action.selector);
        const aInput = (a.inputs || []).find(i => i.selector === action.selector);
        inputChanged = (bInput?.value !== aInput?.value);
    }

    // Combined success: any meaningful change counts
    let success = urlChanged || domChanged || scrollChanged ||
                    elementChanged || overlayAppeared || overlayDisappeared || inputChanged;

    // Auth submit clicks require stronger proof than generic DOM twitching.
    if (action?.type === 'CLICK') {
        const intentBlob = asText(action?.text, action?.reasoning, action?.goalText, action?.selector);
        const looksLikeAuthSubmit = /\b(log\s*in|login|sign\s*in|signin|submit)\b/.test(intentBlob);

        if (looksLikeAuthSubmit) {
            const beforeHadPassword = hasVisiblePasswordInput(b);
            const afterHasPassword = hasVisiblePasswordInput(a);
            const beforeUrl = b.url || '';
            const afterUrl = a.url || '';

            const movedOffLoginRoute =
                (beforeUrl && isLoginLikeUrl(beforeUrl) && afterUrl && !isLoginLikeUrl(afterUrl)) ||
                (urlChanged && !isLoginLikeUrl(afterUrl));
            const passwordFieldGone = beforeHadPassword && !afterHasPassword;
            const loggedInUI = hasLoggedInIndicators(a);

            success = movedOffLoginRoute || passwordFieldGone || loggedInUI;
        }
    }

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
