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
  const rawSnapshot = await page.evaluate(() => {
    // Helper: get visible text
    function getVisibleText() {
      let text = '';
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.parentElement && node.parentElement.offsetParent !== null) {
          text += node.textContent.trim() + ' ';
        }
      }
      return text.trim();
    }

    // Helper: get interactive elements
    function getInteractiveElements() {
      const elements = [];
      const selectors = 'a, button, input, select, textarea, [role], [onclick], [tabindex]';
      document.querySelectorAll(selectors).forEach((el, i) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        elements.push({
          index: i,
          role: el.getAttribute('role') || el.tagName.toLowerCase(),
          text: (el.innerText || el.value || el.placeholder || '').trim().slice(0, 50),
          selector: el.id ? `#${el.id}` : el.className ? `.${el.className.split(' ').join('.')}` : el.tagName.toLowerCase(),
          position: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
          visible: el.offsetParent !== null
        });
      });
      return elements;
    }

    // Helper: get overlays
    function getOverlays() {
      return Array.from(document.querySelectorAll('[role="dialog"], .modal, .popup')).map(el => {
        const rect = el.getBoundingClientRect();
        return {
          selector: el.id ? `#${el.id}` : el.className ? `.${el.className.split(' ').join('.')}` : el.tagName.toLowerCase(),
          text: el.innerText.trim().slice(0, 200),
          position: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
          visible: el.offsetParent !== null
        };
      });
    }

    // Helper: get scroll position
    function getScrollPosition() {
      return { x: window.scrollX, y: window.scrollY };
    }

    // Inputs, buttons, links
    const inputs = Array.from(document.querySelectorAll('input, textarea')).map(el => ({
      selector: el.id ? `#${el.id}` : el.className ? `.${el.className.split(' ').join('.')}` : el.tagName.toLowerCase(),
      value: (el.value || '').slice(0, 100),
      placeholder: (el.placeholder || '').slice(0, 80),
      visible: el.offsetParent !== null
    }));
    const buttons = Array.from(document.querySelectorAll('button')).map(el => ({
      selector: el.id ? `#${el.id}` : el.className ? `.${el.className.split(' ').join('.')}` : el.tagName.toLowerCase(),
      text: el.innerText.trim().slice(0, 50),
      visible: el.offsetParent !== null
    }));
    const links = Array.from(document.querySelectorAll('a')).map(el => ({
      selector: el.id ? `#${el.id}` : el.className ? `.${el.className.split(' ').join('.')}` : el.tagName.toLowerCase(),
      href: el.href,
      text: el.innerText.trim().slice(0, 50),
      visible: el.offsetParent !== null
    }));

    return {
      url: location.href,
      title: document.title,
      visibleText: getVisibleText(),
      interactiveElements: getInteractiveElements(),
      inputs,
      buttons,
      links,
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
