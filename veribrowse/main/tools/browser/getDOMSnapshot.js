// getDOMSnapshot.js
// Returns a structured, SANITIZED snapshot of all visible, interactive elements on the page.
// Security: strips invisible/zero-width characters and wraps all page-derived text
// in fenced delimiters so the LLM can distinguish agent instructions from page content.

/**
 * Strips invisible Unicode characters that could be used for prompt injection.
 * Removes zero-width spaces, joiners, direction overrides, and other non-printing chars.
 */
function sanitizeText(raw) {
  if (!raw) return '';
  return raw
    // Zero-width & invisible formatting characters
    .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u2000-\u200A\u2060-\u2064\u2066-\u206F]/g, '')
    // Control characters except normal whitespace (tab, newline, carriage return)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
}

export default async function getDOMSnapshot(page) {
  // IMPORTANT: The function body passed to page.evaluate() is serialised to a string
  // and evaluated inside the browser page — the webpack/Electron runtime is NOT available
  // there. Babel/core-js3 transforms String.prototype.trim() into a polyfill import
  // (_babel_runtime_corejs3_core_js_stable_instance_trim__WEBPACK_IMPORTED_MODULE_0___default)
  // which causes a ReferenceError in the browser context.
  // Fix: define a trim helper inside the evaluate scope using regex, which Babel leaves alone.
  const rawSnapshot = await page.evaluate(() => {
    // Safe trim — never polyfilled by Babel because it's a plain regex replace
    function tr(s) { return s ? s.replace(/^\s+|\s+$/g, '') : ''; }

    // ── Visibility helper ──────────────────────────────────────────────
    // COMPLETE REWRITE: Handles modals, overlays, and hard-to-detect elements correctly
    // Key insight: offsetParent === null doesn't mean hidden if in a position:fixed modal
    function isVis(el) {
      // Rule 1: Normal DOM flow elements
      if (el.offsetParent !== null) return true;

      // Rule 2: Element dimensions check
      var r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false; // zero-size = hidden

      // Rule 3: Direct CSS display/visibility check
      try {
        var s = window.getComputedStyle(el);
        if (s.display === 'none') return false;
        if (s.visibility === 'hidden' && s.pointerEvents === 'none') return false;
      } catch (e) {
        // If we can't get computed style, assume visible (safer)
      }

      // Rule 4: Walk up checking for hidden ancestors
      var parent = el.parentElement;
      var depth = 0;
      while (parent && depth < 25) {
        try {
          var ps = window.getComputedStyle(parent);
          // If parent has display:none - we're hidden
          if (ps.display === 'none') return false;
          // If parent has position:fixed - we're likely in a modal (visible!)
          if (ps.position === 'fixed' || ps.position === 'sticky') {
            return r.width > 0 && r.height > 0; // Modal element - visible if has size
          }
        } catch (e) {
          // Continue walking
        }
        parent = parent.parentElement;
        depth++;
      }

      // Rule 5: If we got here - element has dimensions and no display:none in chain
      // Mark as visible (might be off-screen but that's OK - we still need to interact with it)
      return r.width > 0 && r.height > 0;
    }

    // Safe selector builder — avoids chained prototype methods that Babel might polyfill
    function buildSelector(el) {
      // Only use id if it contains no CSS-invalid characters (e.g. ad iframe ids have '/')
      if (el.id && !/[/:.()[\]{}|\\]/.test(el.id)) return '#' + el.id;
      if (el.className && typeof el.className === 'string' && tr(el.className)) {
        var cls = el.className.replace(/^\s+|\s+$/g, '').replace(/\s+/g, '.');
        return '.' + cls;
      }
      return el.tagName.toLowerCase();
    }

    function safeId(id) {
       if (!id) return '';
       // If ID looks like a URL or has invalid CSS chars, don't expose it to avoid LLM hallucinating bad selectors
       if (/[/:.()[\]{}|\\]/.test(id)) return '';
       return id;
    }

    // Helper: get visible text
    function getVisibleText() {
      var text = '';
      if (!document || !document.body) return '';
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) {
        if (node.parentElement && isVis(node.parentElement)) {
          text += tr(node.textContent) + ' ';
        }
      }
      return tr(text);
    }

    // Helper: get interactive elements
    function getInteractiveElements() {
      var elements = [];
      var selectors = 'a, button, input, select, textarea, [role], [onclick], [tabindex]';
      var all = document.querySelectorAll(selectors);
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        var rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        var rawText = el.innerText || el.value || el.placeholder || '';
        elements.push({
          index: i,
          id: safeId(el.id),
          role: el.getAttribute('role') || el.tagName.toLowerCase(),
          ariaLabel: el.getAttribute('aria-label') || '',
          text: tr(rawText).substring(0, 50),
          selector: buildSelector(el),
          position: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
          visible: isVis(el)
        });
      }
      return elements;
    }

    // Helper: get overlays
    function getOverlays() {
      var overlays = [];
      // Include Angular CDK overlays and common modal frameworks
      var all = document.querySelectorAll('[role="dialog"], .modal, .popup, .cdk-overlay-container, .cdk-overlay-pane, [class*="overlay"], .modal-dialog');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        var rect = el.getBoundingClientRect();
        overlays.push({
          selector: buildSelector(el),
          text: tr(el.innerText || '').substring(0, 200),
          position: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
          visible: isVis(el)
        });
      }
      return overlays;
    }

    // Helper: get scroll position
    function getScrollPosition() {
      return { x: window.scrollX, y: window.scrollY };
    }

    // Inputs, buttons, links
    var inputEls = document.querySelectorAll('input, textarea');
    var inputs = [];
    for (var i = 0; i < inputEls.length; i++) {
      var el = inputEls[i];
      inputs.push({
        selector: buildSelector(el),
        id: safeId(el.id),
        name: el.name || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        role: el.getAttribute('role') || '',
        ariaExpanded: el.getAttribute('aria-expanded') || '',
        value: (el.value || '').substring(0, 100),
        placeholder: (el.placeholder || '').substring(0, 80),
        visible: isVis(el),
        type: el.type || ''
      });
    }

    // Also capture contenteditable divs that act as inputs (Google Flights, etc.)
    var editableDivs = document.querySelectorAll('[contenteditable="true"], [role="combobox"], [role="textbox"]');
    for (var ii = 0; ii < editableDivs.length; ii++) {
      var edEl = editableDivs[ii];
      // Skip if already captured as input/textarea
      if (edEl.tagName === 'INPUT' || edEl.tagName === 'TEXTAREA') continue;
      inputs.push({
        selector: buildSelector(edEl),
        id: safeId(edEl.id),
        name: edEl.getAttribute('name') || '',
        ariaLabel: edEl.getAttribute('aria-label') || '',
        role: edEl.getAttribute('role') || 'contenteditable',
        ariaExpanded: edEl.getAttribute('aria-expanded') || '',
        value: (edEl.textContent || '').substring(0, 100),
        placeholder: edEl.getAttribute('placeholder') || '',
        visible: isVis(edEl),
        type: 'contenteditable'
      });
    }

    var buttonEls = document.querySelectorAll('button');
    var buttons = [];
    for (var j = 0; j < buttonEls.length; j++) {
      var elBtn = buttonEls[j];
      buttons.push({
        selector: buildSelector(elBtn),
        text: tr(elBtn.innerText || '').substring(0, 50),
        visible: isVis(elBtn)
      });
    }

    var linkEls = document.querySelectorAll('a');
    var links = [];
    for (var k = 0; k < linkEls.length; k++) {
      var elLink = linkEls[k];
      links.push({
        selector: buildSelector(elLink),
        href: elLink.href,
        text: tr(elLink.innerText || '').substring(0, 50),
        visible: isVis(elLink)
      });
    }

    return {
      url: location.href,
      title: document.title,
      visibleText: getVisibleText(),
      interactiveElements: getInteractiveElements(),
      inputs: inputs,
      buttons: buttons,
      links: links,
      overlays: getOverlays(),
      scrollPosition: getScrollPosition()
    };
  });

  // ── Post-process: sanitize all text fields to defeat prompt injection ──
  rawSnapshot.title = sanitizeText(rawSnapshot.title);
  rawSnapshot.visibleText = `===PAGE_CONTENT_START===\n${sanitizeText(rawSnapshot.visibleText)}\n===PAGE_CONTENT_END===`;

  for (const el of rawSnapshot.interactiveElements || []) {
    el.text = sanitizeText(el.text);
    el.ariaLabel = sanitizeText(el.ariaLabel);
  }
  for (const el of rawSnapshot.buttons || []) {
    el.text = sanitizeText(el.text);
  }
  for (const el of rawSnapshot.links || []) {
    el.text = sanitizeText(el.text);
  }
  for (const el of rawSnapshot.overlays || []) {
    el.text = sanitizeText(el.text);
  }
  for (const el of rawSnapshot.inputs || []) {
    el.value = sanitizeText(el.value);
    el.placeholder = sanitizeText(el.placeholder);
    el.ariaLabel = sanitizeText(el.ariaLabel);
  }

  return rawSnapshot;
}
