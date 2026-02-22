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

    // Safe selector builder — avoids chained prototype methods that Babel might polyfill
    function buildSelector(el) {
      if (el.id) return '#' + el.id;
      if (el.className && typeof el.className === 'string' && tr(el.className)) {
        var cls = el.className.replace(/^\s+|\s+$/g, '').replace(/\s+/g, '.');
        return '.' + cls;
      }
      return el.tagName.toLowerCase();
    }

    // Helper: get visible text
    function getVisibleText() {
      var text = '';
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) {
        if (node.parentElement && node.parentElement.offsetParent !== null) {
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
          role: el.getAttribute('role') || el.tagName.toLowerCase(),
          text: tr(rawText).substring(0, 50),
          selector: buildSelector(el),
          position: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
          visible: el.offsetParent !== null
        });
      }
      return elements;
    }

    // Helper: get overlays
    function getOverlays() {
      var overlays = [];
      var all = document.querySelectorAll('[role="dialog"], .modal, .popup');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        var rect = el.getBoundingClientRect();
        overlays.push({
          selector: buildSelector(el),
          text: tr(el.innerText || '').substring(0, 200),
          position: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
          visible: el.offsetParent !== null
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
        value: (el.value || '').substring(0, 100),
        placeholder: (el.placeholder || '').substring(0, 80),
        visible: el.offsetParent !== null
      });
    }

    var buttonEls = document.querySelectorAll('button');
    var buttons = [];
    for (var j = 0; j < buttonEls.length; j++) {
      var elBtn = buttonEls[j];
      buttons.push({
        selector: buildSelector(elBtn),
        text: tr(elBtn.innerText || '').substring(0, 50),
        visible: elBtn.offsetParent !== null
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
        visible: elLink.offsetParent !== null
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
  }

  return rawSnapshot;
}
