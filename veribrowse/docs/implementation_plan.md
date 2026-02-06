# Agentic Browser Implementation Plan

## Goal Description
Build a Windows-based agentic browser that autonomously performs web searches, summarizes results, and executes navigation commands using AI, with both text and voice interaction.

**Architecture**: Electron Dual-Process Architecture.
- **UI Shell**: Next.js rendered in the main window.
- **Browser Engine**: Electron `WebContentsView` (formerly BrowserView) for actual web pages.
- **Automation**: Node.js Agent Controller uses Chrome DevTools Protocol (CDP) via `electron` debugger to control the `WebContentsView`.

```
Electron Main Process
   │
   ├── UI Window (Next.js)
   │
   └── WebContentsView (Hidden/Visible) ◄──┐
          │                                │
          │ CDP (Debugger)                 │
          ▼                                │
   Agent Controller ───────────────────────┘
   (Navigates, Clicks, Reads DOM)
```

## User Review Required
> [!IMPORTANT]
> **Major UI Pivot: Verdant Meadow & Sunlit Canopy (Light Forest)**:
> - **Foundation (Sunlit Meadow)**: `#CFFFDC` (Mint Glass) and `white` for core container backgrounds.
> - **Primary Text (Obsidian Forest)**: `#253D2C` for high readability on light foundations.
> - **Accents (Forest & Sage)**: `#2E6F40` (Forest Green) and `#68BA7F` (Emerald Sage) for primary actions and active states.
> - **Glassmorphism**: Sun-kissed glassmorphism using `backdrop-blur-3xl` with light mint tints (`#CFFFDC/40`) or translucent white (`white/60`).
> - **Gradients**: Verdant transitions from `#68BA7F` to `#CFFFDC` for a breezy, sunlit feel.
> - **Micro-Animations**: Preserving "Growth" transitions, leaf-sway drifts, and organic expansion effects.

## Proposed Changes (Phased Approach)

### Phase 1: Electron + Next.js Shell (Completed)
Established the core application structure and UI.
- [x] UI Components (SearchBar, Tabs, Sidebar) with Fellou.ai aesthetic.
- [x] Tailwind setup.

### Phase 2: Native Electron Automation
Integrate the native browser engine and automation.

#### [MODIFY] [main/background.js](file:///d:/github/VeriBrowse/veribrowse/main/background.js)
- Implement `TabManager` to manage `WebContentsView` instances.
- display `WebContentsView` inside the main window (positioned below the navbar).

#### [NEW] Automation Service
- `main/services/AutomationService.js`: Wrapper for Electron `debugger`.
  - `attach(webContents)`: Attach CDP.
  - `navigate(url)`: `Page.navigate`.
  - `click(selector)`: Find element center via DOM, `Input.dispatchMouseEvent`.
  - `type(text)`: `Input.dispatchKeyEvent`.
  - `getSnapshot()`: `Page.captureScreenshot` (optional, since user sees live view).
  - `getDOM()`: `Runtime.evaluate` to get page content for AI.

#### [NEW] IPC Handlers
- `browser:navigate`, `browser:activeTab`, etc. linking UI to `AutomationService`.

### Phase 2.5: Download-as-a-Service [REFACTORED]
Decoupled download management from tab logic for better stability.
- [x] **[NEW]** `main/helpers/DownloadManager.js`: Standalone service monitoring the Electron session.
- [x] Integrate `DownloadManager` into `background.js`.
- [x] Automated save path to system Downloads folder (Silent downloads).
- [x] Refine `renderer/components/UnifiedHeader.jsx` listeners for persistent history.
- [x] **[NEW]** Navigation Loading Indicators: `did-start-loading` / `did-stop-loading` IPC signals.


### Phase 3: Command Core UI Revamp
Implement the high-fidelity UI layout based on the "Command Core" design.

#### [MODIFY] [BrowserShell.jsx](file:///d:/github/VeriBrowse/veribrowse/renderer/components/BrowserShell.jsx)
- Redesign for a unified header (Tabs + Search/URL bar in one row).
- Implement the "Command Bar" dialog management.

#### [MODIFY] [GeminiSidebar.jsx](file:///d:/github/VeriBrowse/veribrowse/renderer/components/GeminiSidebar.jsx)
- Update to "Flight Controller" v2: specialized icons (Home, Downloads, History, etc.) and architectural log stream.

#### [MODIFY] [ContentDisplay.jsx](file:///d:/github/VeriBrowse/veribrowse/renderer/components/ContentDisplay.jsx)
- Redesign for "Initial View" (Image 4) with centered search and quick actions.

#### [NEW] Gemini Service
- `main/services/GeminiService.js`: Wrapper for Gemini API
  - Initialize with API key (from config/env)
  - Summarization: Page content → Gemini → Summary
  - Command parsing: Natural language → JSON actions
  - Multi-turn conversation support

#### [MODIFY] Agent Controller
- Integrate `GeminiService` into `AgentController`
- Implement command execution flow:
  1. User input → Gemini
  2. Gemini returns structured command (JSON)
  3. AgentController executes via PlaywrightService
  4. Results sent back to UI

#### [NEW] Command Schema
Define JSON command format for agent actions:
```json
{ "action": "navigate", "url": "https://google.com" }
{ "action": "click", "selector": "#search-button" }
{ "action": "search", "query": "AI news" }
{ "action": "summarize", "target": "current_page" }
```

---

### Phase 4: Voice Command System
Enable voice control using Whisper.

#### [NEW] Voice Service
- `main/services/VoiceService.js`: Whisper integration
  - Use `whisper-node` or Python sidecar for local inference
  - Audio recording → Transcription → Text
  - Feed transcribed text to Agent Controller

#### [MODIFY] Renderer UI
- Add microphone button to `SearchBar.js`
- Implement audio recording in renderer
- Send audio data to main process via IPC
- Display transcription status/results

---

### Phase 5: Agent Autonomy & Polish
Enable multi-step autonomous workflows and polish the UI.

#### Autonomous Workflows
- Implement goal-based execution in `AgentController`
- Multi-step loop: Observe (screenshot/DOM) → Think (Gemini) → Act (Playwright) → Repeat
- Example: "Find cheapest flight to NYC" → Search → Compare → Report

#### UI Polish
- Dark mode theme (default)
- Smooth animations for tab switching
- Loading states and progress indicators
- Error handling and user feedback
- Settings panel (API keys, preferences)

#### Security & Validation
- Validate all Gemini commands before execution
- Sandbox Playwright browser context
- Rate limiting for API calls
- User confirmation for sensitive actions (e.g., form submissions)

---

## Verification Plan

### Phase 1 Verification
**Manual**:
- Run `npm run dev`
- Verify Electron window opens with Next.js UI
- Verify all UI components render: SearchBar, TabsManager, ContentDisplay, GeminiSidebar
- Test window controls (minimize, maximize, close)
- Test responsive layout

### Phase 2 Verification
**Manual**:
- Enter URL in search bar -> Verify `WebContentsView` loads and appears consistently inside the window.
- Resize window -> Verify content view resizes correctly.
- Switch tabs -> Verify views swap instantly.

### Phase 2.5 Verification (Download Status)
**Manual**:
- Navigate to a direct file download link (e.g., a PDF or .zip).
- Verify a download status bar appears at the bottom with filename and progress.
- Verify the bar disappears or shows "Completed" when finished.

**Automated**:
- Unit test for `AutomationService`: Verify attaching debugger and sending simple CDP commands (like `Runtime.evaluate`).

### Phase 3 Verification
**Automated**:
- Mock Gemini responses and test command parsing
- Test command execution flow end-to-end

**Manual**:
- With Gemini API key configured:
  - Type "Open Google" → Verify navigation
  - Type "Summarize this page" → Verify summary appears in sidebar
  - Test multi-turn conversation with Gemini

### Phase 4 Verification
**Manual**:
- Click microphone button → Record voice command
-
# Phase 5: AI Core Integration

## Goal Description
Integrate Google's Gemini API to power the "Flight Controller" of VeriBrowse. This will verify the ability to control the browser using natural language commands (e.g., "Search for X", "Read this page").

## User Review Required
> [!IMPORTANT]
> **API Key Required**: You will need to provide a `GEMINI_API_KEY` to enable the AI features. I will create a `.env` file for you to paste it into.

## Proposed Changes

### Main Process
#### [NEW] [GeminiService.js](file:///d:/github/VeriBrowse/veribrowse/main/services/GeminiService.js)
- Handles direct communication with Gemini API (generative-ai SDK).
- Manages chat history and context window.
- Exports `streamResponse(prompt)` and `generateAction(userRequest)`.

#### [NEW] [AgentController.js](file:///d:/github/VeriBrowse/veribrowse/main/controllers/AgentController.js)
- The "Brain" that connects `GeminiService` to `AutomationService`.
- Defines tools/functions for the LLM:
    - `navigate(url)`
    - `click(selector)`
    - `type(selector, text)`
    - `page_content()`
- Loops: Request -> LLM -> Tool Call -> Execute -> Result -> LLM.

#### [MODIFY] [background.js](file:///d:/github/VeriBrowse/veribrowse/main/background.js)
- Register IPC handlers:
    - `agent:send-prompt`: Use AgentController to process request.
    - `agent:stop`: Halt current execution.

### Renderer Process
#### [MODIFY] [GeminiSidebar.jsx](file:///d:/github/VeriBrowse/veribrowse/renderer/components/GeminiSidebar.jsx)
- Connect input to `agent:send-prompt`.
- Render streaming responses.
- render "Tool usage" logs (e.g., "Navigating to...", "Reading page...").

## Verification Plan
### Automated Tests
- N/A for this phase (manual verification preferred for AI behavior).

### Manual Verification
1.  **Chat Test**: Send "Hello" and verify streaming response.
2.  **Navigation Test**: Send "Go to fellou.ai" and verify browser navigates to the URL.
3.  **Read Test**: Send "Summarize this page" and verify it reads the active tab's content.
 (network failure, invalid commands)
- Verify security: Attempt malicious command, verify validation blocks it
