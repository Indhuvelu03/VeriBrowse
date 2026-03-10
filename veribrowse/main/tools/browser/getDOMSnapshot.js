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
    .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u2000-\u200A\u2060-\u2064\u2066-\u206F]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
}

export default async function getDOMSnapshot(page) {
  const rawSnapshot = await page.evaluate(() => {
    // Safe trim helper inside page context (avoids Babel polyfill issues).
    function tr(s) { return s ? s.replace(/^\s+|\s+$/g, '') : ''; }

    function escAttr(v) {
      return tr(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    function lower(s) {
      return tr(s || '').toLowerCase();
    }

    function toNum(value, fallback) {
      var n = +(value == null ? '' : value);
      return n === n ? n : fallback;
    }

    function toInt(value, fallback) {
      var n = toNum(value, fallback);
      if (n !== n) return fallback;
      return n < 0 ? Math.ceil(n) : Math.floor(n);
    }

    function looksSponsoredUrl(url) {
      var u = lower(url || '');
      if (!u) return false;
      return (
        /googleadservices/.test(u) ||
        /doubleclick/.test(u) ||
        /googlesyndication/.test(u) ||
        /\/aclk/.test(u) ||
        /adurl=/.test(u) ||
        /gclid=/.test(u)
      );
    }

    function looksSponsoredText(s) {
      var t = lower(s || '');
      return (
        /sponsored/.test(t) ||
        /advertisement/.test(t) ||
        /promoted/.test(t) ||
        /ad choice/.test(t) ||
        /ads by/.test(t)
      );
    }

    function elementBlob(el) {
      if (!el) return '';
      var cls = '';
      if (typeof el.className === 'string') cls = el.className;
      return lower(
        (el.id || '') + ' ' +
        cls + ' ' +
        (el.getAttribute('role') || '') + ' ' +
        (el.getAttribute('aria-label') || '') + ' ' +
        (el.getAttribute('data-testid') || '') + ' ' +
        (el.getAttribute('name') || '') + ' ' +
        (el.getAttribute('title') || '')
      );
    }

    function isAdLikeElement(el) {
      if (!el) return false;
      var blob = elementBlob(el);
      if (
        /sponsored/.test(blob) ||
        /advert/.test(blob) ||
        /promo/.test(blob) ||
        /adslot/.test(blob) ||
        /google-ad/.test(blob) ||
        /ad-container/.test(blob) ||
        /banner-ad/.test(blob)
      ) {
        return true;
      }

      var href = lower(el.getAttribute('href') || '');
      var src = lower(el.getAttribute('src') || '');
      if (looksSponsoredUrl(href) || looksSponsoredUrl(src)) return true;
      if (looksSponsoredText(el.innerText || '')) return true;
      return false;
    }

    function hasAdAncestor(el) {
      var cur = el;
      var depth = 0;
      while (cur && depth < 7) {
        if (isAdLikeElement(cur)) return true;
        cur = cur.parentElement;
        depth++;
      }
      return false;
    }

    function isActuallyVisible(el) {
      if (!el) return false;
      var rect = el.getBoundingClientRect();
      if (!rect || rect.width < 3 || rect.height < 3) return false;

      var st = window.getComputedStyle(el);
      if (!st) return false;
      if (st.display === 'none' || st.visibility === 'hidden') return false;
      if (toNum(st.opacity || '1', 1) < 0.05) return false;
      if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false;

      if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
      if (rect.right < 0 || rect.left > window.innerWidth) return false;

      var cx = Math.floor(Math.max(0, Math.min(window.innerWidth - 1, rect.left + rect.width / 2)));
      var cy = Math.floor(Math.max(0, Math.min(window.innerHeight - 1, rect.top + rect.height / 2)));
      var topEl = document.elementFromPoint(cx, cy);
      if (!topEl) return false;

      if (topEl === el) return true;
      if (el.contains(topEl)) return true;
      if (topEl.contains(el)) return true;
      return false;
    }

    function buildSelector(el) {
      var tag = el.tagName.toLowerCase();
      if (el.id) return '#' + el.id;

      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        var name = tr(el.getAttribute('name') || '');
        var type = tr(el.getAttribute('type') || '');
        var autocomplete = tr(el.getAttribute('autocomplete') || '');
        var placeholder = tr(el.getAttribute('placeholder') || '');
        var ariaLabel = tr(el.getAttribute('aria-label') || '');

        if (name && type && tag === 'input') return 'input[name="' + escAttr(name) + '"][type="' + escAttr(type) + '"]';
        if (name) return tag + '[name="' + escAttr(name) + '"]';
        if (type && tag === 'input' && type !== 'text') return 'input[type="' + escAttr(type) + '"]';
        if (autocomplete) return tag + '[autocomplete="' + escAttr(autocomplete) + '"]';
        if (ariaLabel) return tag + '[aria-label="' + escAttr(ariaLabel) + '"]';
        if (placeholder) return tag + '[placeholder="' + escAttr(placeholder) + '"]';
      }

      if (el.className && typeof el.className === 'string' && tr(el.className)) {
        var cls = el.className.replace(/^\s+|\s+$/g, '').replace(/\s+/g, '.');
        return tag + '.' + cls;
      }

      var idx = 1;
      var prev = el.previousElementSibling;
      while (prev) {
        if (prev.tagName === el.tagName) idx++;
        prev = prev.previousElementSibling;
      }

      var parent = el.parentElement;
      if (parent) {
        var pTag = parent.tagName.toLowerCase();
        if (parent.id) return '#' + parent.id + ' > ' + tag + ':nth-of-type(' + idx + ')';
        if (parent.className && typeof parent.className === 'string' && tr(parent.className)) {
          var firstClass = parent.className.replace(/^\s+|\s+$/g, '').split(/\s+/)[0];
          if (firstClass) return pTag + '.' + firstClass + ' > ' + tag + ':nth-of-type(' + idx + ')';
        }
      }

      return tag + ':nth-of-type(' + idx + ')';
    }

    function getVisibleText() {
      var text = '';
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) {
        var parent = node.parentElement;
        if (!parent) continue;
        if (!isActuallyVisible(parent)) continue;
        if (hasAdAncestor(parent)) continue;
        var t = tr(node.textContent);
        if (t) text += t + ' ';
      }
      return tr(text);
    }

    function getInteractiveElements() {
      var elements = [];
      var selectors = 'a, button, input, select, textarea, [role], [onclick], [tabindex], [aria-label], [title]';
      var all = document.querySelectorAll(selectors);

      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (!isActuallyVisible(el)) continue;
        if (hasAdAncestor(el)) continue;

        var rect = el.getBoundingClientRect();
        var text = tr(el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || el.getAttribute('title') || '');
        var ariaLabel = tr(el.getAttribute('aria-label') || '');
        var title = tr(el.getAttribute('title') || '');
        var tag = el.tagName.toLowerCase();
        var role = tr(el.getAttribute('role') || tag);

        elements.push({
          index: i,
          role: role,
          tag: tag,
          text: text.substring(0, 80),
          ariaLabel: ariaLabel.substring(0, 80),
          title: title.substring(0, 80),
          selector: buildSelector(el),
          position: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          visible: true,
        });
      }

      return elements;
    }

    function getOverlays() {
      var overlays = [];
      var seen = {};
      var explicit = document.querySelectorAll(
        '[role="dialog"], [aria-modal="true"], .modal, .popup, .overlay, [class*="modal"], [class*="overlay"]'
      );

      function pushOverlay(el, zIndex) {
        var sel = buildSelector(el);
        if (seen[sel]) return;
        seen[sel] = true;
        var rect = el.getBoundingClientRect();
        overlays.push({
          selector: sel,
          text: tr(el.innerText || '').substring(0, 240),
          position: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          visible: isActuallyVisible(el),
          zIndex: zIndex || 0,
        });
      }

      for (var i = 0; i < explicit.length; i++) {
        var ex = explicit[i];
        var exStyle = window.getComputedStyle(ex);
        var exZ = toInt(exStyle.zIndex || '0', 0);
        if (isActuallyVisible(ex)) pushOverlay(ex, exZ);
      }

      var all = document.querySelectorAll('body *');
      var viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
      for (var j = 0; j < all.length; j++) {
        var el = all[j];
        if (!isActuallyVisible(el)) continue;
        if (hasAdAncestor(el)) continue;

        var st = window.getComputedStyle(el);
        if (!st || st.position !== 'fixed') continue;

        var z = toInt(st.zIndex || '0', 0);
        if (z < 100) continue;

        var rect = el.getBoundingClientRect();
        var area = Math.max(0, rect.width * rect.height);
        var ratio = area / viewportArea;
        if (ratio < 0.12) continue;

        pushOverlay(el, z);
      }

      return overlays;
    }

    function getScrollPosition() {
      return { x: window.scrollX, y: window.scrollY };
    }

    var inputEls = document.querySelectorAll('input, textarea');
    var inputs = [];
    for (var m = 0; m < inputEls.length; m++) {
      var elInput = inputEls[m];
      if (hasAdAncestor(elInput)) continue;
      inputs.push({
        selector: buildSelector(elInput),
        tag: elInput.tagName.toLowerCase(),
        type: tr(elInput.type || '').substring(0, 40),
        name: tr(elInput.name || '').substring(0, 80),
        autocomplete: tr(elInput.autocomplete || '').substring(0, 80),
        ariaLabel: tr(elInput.getAttribute('aria-label') || '').substring(0, 80),
        title: tr(elInput.getAttribute('title') || '').substring(0, 80),
        value: tr(elInput.value || '').substring(0, 120),
        placeholder: tr(elInput.placeholder || '').substring(0, 120),
        visible: isActuallyVisible(elInput),
      });
    }

    var buttonEls = document.querySelectorAll('button');
    var buttons = [];
    for (var n = 0; n < buttonEls.length; n++) {
      var elBtn = buttonEls[n];
      if (hasAdAncestor(elBtn)) continue;
      buttons.push({
        selector: buildSelector(elBtn),
        text: tr(elBtn.innerText || elBtn.getAttribute('aria-label') || elBtn.getAttribute('title') || '').substring(0, 80),
        ariaLabel: tr(elBtn.getAttribute('aria-label') || '').substring(0, 80),
        title: tr(elBtn.getAttribute('title') || '').substring(0, 80),
        visible: isActuallyVisible(elBtn),
      });
    }

    var linkEls = document.querySelectorAll('a[href]');
    var links = [];
    for (var p = 0; p < linkEls.length; p++) {
      var elLink = linkEls[p];
      var href = elLink.href || '';
      var sponsored = hasAdAncestor(elLink) || looksSponsoredUrl(href) || looksSponsoredText(elLink.innerText || '');
      links.push({
        selector: buildSelector(elLink),
        href: href,
        text: tr(elLink.innerText || elLink.getAttribute('aria-label') || elLink.getAttribute('title') || '').substring(0, 100),
        ariaLabel: tr(elLink.getAttribute('aria-label') || '').substring(0, 80),
        title: tr(elLink.getAttribute('title') || '').substring(0, 80),
        visible: isActuallyVisible(elLink),
        sponsored: sponsored,
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
      scrollPosition: getScrollPosition(),
    };
  });

  rawSnapshot.title = sanitizeText(rawSnapshot.title);
  rawSnapshot.visibleText = `===PAGE_CONTENT_START===\n${sanitizeText(rawSnapshot.visibleText)}\n===PAGE_CONTENT_END===`;

  for (const el of rawSnapshot.interactiveElements || []) {
    el.text = sanitizeText(el.text);
    el.ariaLabel = sanitizeText(el.ariaLabel);
    el.title = sanitizeText(el.title);
    el.role = sanitizeText(el.role);
    el.tag = sanitizeText(el.tag);
  }
  for (const el of rawSnapshot.buttons || []) {
    el.text = sanitizeText(el.text);
    el.ariaLabel = sanitizeText(el.ariaLabel);
    el.title = sanitizeText(el.title);
  }
  for (const el of rawSnapshot.links || []) {
    el.text = sanitizeText(el.text);
    el.ariaLabel = sanitizeText(el.ariaLabel);
    el.title = sanitizeText(el.title);
  }
  for (const el of rawSnapshot.overlays || []) {
    el.text = sanitizeText(el.text);
  }
  for (const el of rawSnapshot.inputs || []) {
    el.tag = sanitizeText(el.tag);
    el.type = sanitizeText(el.type);
    el.name = sanitizeText(el.name);
    el.autocomplete = sanitizeText(el.autocomplete);
    el.ariaLabel = sanitizeText(el.ariaLabel);
    el.title = sanitizeText(el.title);
    el.value = sanitizeText(el.value);
    el.placeholder = sanitizeText(el.placeholder);
  }

  return rawSnapshot;
}
