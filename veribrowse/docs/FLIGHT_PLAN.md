# VeriBrowse: Flight Plan (Implementation Strategy)

A technical roadmap for continuing the development of the VeriBrowse Agentic Browser.

## 🏗️ Core Architecture
- **Main Process**: Electron + `DownloadManager` (Services), `TabManager` (Views).
- **Renderer**: Next.js (Dashboard + Controls).
- **Automation**: `AutomationService.js` (Chrome DevTools Protocol Interface).
- **Agent Intelligence**: `AgentController.js` (Next Implementation Phase).

## 🧭 Immediate Technical Roadmap

### 1. AI Intelligence Layer (Phase 6)
- **Service**: Create `main/services/GeminiService.js` using `@google/generative-ai`.
- **Command Schema**: Standardize JSON actions:
  ```json
  { "action": "navigate", "url": "..." }
  { "action": "click", "selector": "..." }
  { "action": "summarize" }
  ```
- **The Brain**: Implement `main/controllers/AgentController.js` to parse user messages into these actions using tool-calling.

### 2. UI/UX Polishing (Phase 7)
- **History Persistence**: Ensure `DownloadManager` saves history to a local JSON file across restarts.
- **Micro-Styling**: Refine the `SideRail` icons to match the high-fidelity sunlit canopy aesthetic.

### 3. Verification Protocol
- **Navigation Verification**: Ensure `screenshot` data URLs are only used when needed for AI processing, relying on live `WebContentsView` for user display.
- **Safety Boundary**: Implement a confirmation dialog for sensitive agent actions (e.g., clicking 'Buy Now').

## 📜 Completed Architectural Refactors
- **Sep 2025**: Migrated from `BrowserView` to `WebContentsView` for future compatibility.
- **Feb 2026**: Decoupled downloads into `DownloadManager.js` for standalone signal reliability.
- **Feb 2026**: Implemented "Immersive Loading" by hiding the native view and showing React transitions during active navigations.

---
*Ready for hand-off to secondary agentic models.*
