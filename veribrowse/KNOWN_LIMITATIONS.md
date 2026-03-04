# Known Limitations & Workarounds

## Intentional Limitations (Security-First Design)

### OTP / Verification Code Fields
**Status**: Intentionally Blocked (Security)

**Why**: Preventing auto-fill of OTP protects against credential compromise and account takeover.

**Workaround**: User must manually enter OTP code when prompted.

---

### Payment / Card Fields  
**Status**: Intentionally Blocked (Security & Fraud Prevention)

**Why**: Preventing auto-fill of sensitive payment information prevents fraud and data breaches.

**Workaround**: User must manually enter card details when prompted.

---

### CAPTCHA Pages
**Status**: No Solving Capability

**Why**: CAPTCHA designed to stop automation; no reliable solving without manual intervention.

**Workaround**: Manually solve CAPTCHA or simplify request to avoid CAPTCHA pages.

---

## Technical Limitations

### Shadow DOM Elements
**Status**: Not Pierced (Low Priority)

**Impact**: Affects ~15% of modern websites (Google Maps, Stripe, Shopify galleries)

**Workaround**: Request simpler goal avoiding shadow DOM elements

---

### Multi-Tab Coordination
**Status**: Not Supported

**Impact**: Rare in practice; most booking sites use single tab

**Workaround**: Ensure automation stays on one tab

---

### WebSocket Real-Time Features
**Status**: Not Supported

**Impact**: Live chat, real-time pricing, collaborative tools affected

**Workaround**: Use sites without real-time features

---

### File Upload / Download
**Status**: Not Implemented

**Impact**: Document-heavy workflows affected

**Workaround**: Manual file operations after automation completes

---

## Website-Specific Issues

### Google Flights
**Issue**: Date picker sometimes requires extra clicks

**Workaround**: Be explicit with dates (include day of week)

**Success Rate**: 70%

---

### Booking.com
**Issue**: Language/region detection may fail

**Workaround**: Set browser language to English, clear cookies

**Success Rate**: 75%

---

### Amazon
**Issue**: Dynamic content requires clear search terms

**Workaround**: Be very specific in product description

**Success Rate**: 80%

---

### IRCTC (Indian Railways)
**Issue**: Modal takes 2-3 seconds to fully load

**Workaround**: System handles with retries (usually succeeds on second attempt)

**Success Rate**: 80%

---

### BookMyShow
**Issue**: None observed - most stable platform

**Success Rate**: 90%+

---

## Error Messages Explained

| Message | Meaning | Solution |
|---------|---------|----------|
| Cannot find field for: email | Non-standard field naming | Try different phrasing |
| Modal still visible after retry | Close button not found | Manually close modal |
| Form submission timed out | SPA rendering slowly | Simplify goal |
| Field not found in snapshot | Shadow DOM or off-screen | Try scrolling |
| OTP field detected - STOPPING | Reached OTP page | Enter OTP manually |
| Payment page reached - stopping | Reached payment page | Enter payment manually |

---

## Overall Success Rates

| Task | Success Rate | Notes |
|------|-------------|-------|
| Movie Booking | 85% | BookMyShow, PVR |
| Train Booking | 80% | IRCTC, with modals |
| Flight Booking | 75% | Skyscanner, MakeMyTrip |
| Form Filling | 85% | Generic forms |
| Data Extraction | 90% | Reading data |
| Search | 95% | Google, Amazon |

---

**Last Updated**: March 4, 2026
**Version**: 1.0
