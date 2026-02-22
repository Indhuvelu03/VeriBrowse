====================================================
VERIBROWSE — FULL REWRITE FROM SCRATCH
Eko 3.0 Agentic Browser | Gemini 2.0 Flash | Supabase
====================================================

This is a FULL REWRITE. Ignore all previous VeriBrowse code entirely.
Build every file completely — no placeholders, no "TODO" comments.
Follow the build order exactly. Wait for GO before each next file.

====================================================
TECH STACK (locked — never suggest alternatives)
====================================================

Desktop Shell:     Electron 28+
UI Framework:      Next.js 14 App Router (renderer)
Browser Agent:     Playwright (Chromium)
Language:          JavaScript ESM only (no TypeScript)
State Management:  Zustand 4
Styling:           Tailwind CSS
Code Quality:      ESLint + Prettier
Primary LLM:       Gemini 2.0 Flash (@google/generative-ai)
Database:          Supabase (PostgreSQL + pgvector)
Settings Store:    electron-store (local, for API keys + preferences)

====================================================
ARCHITECTURE PRINCIPLES (NEVER VIOLATE)
====================================================

PRINCIPLE 1 — THREE HARD LAYERS, NEVER MIXED
  Layer 1  PLANNER  → generates Workflow JSON, never executes anything
  Layer 2  ENGINE   → orchestrates execution, never plans or executes directly
  Layer 3  AGENTS   → execute domain tasks via tools, never plan

PRINCIPLE 2 — TOOLS ARE PURE FUNCTIONS
  Signature: async (context, params) => ({ success, result, error })
  Tools never import agents. Tools never call LLM. Tools do ONE thing only.

PRINCIPLE 3 — EVENTBUS IS THE ONLY INTERNAL WIRE
  Agents never import each other directly.
  Engine never imports Agents directly.
  All internal communication: EventBus.emit() and EventBus.on() only.

PRINCIPLE 4 — SNAPSHOT BEFORE EVERY STEP
  TaskSnapshot.save() called before every tool execution.
  On failure: restore snapshot → replan → resume. Never restart from zero.

PRINCIPLE 5 — IPC HANDLERS HAVE ZERO LOGIC
  IPC files only: receive call → call one Engine/Service method → return.
  All logic lives in Engine, Agents, Tools, Services. Never in IPC.

PRINCIPLE 6 — RENDERER KNOWS NOTHING ABOUT INTERNALS
  Components only read Zustand store.
  Zustand only listens to IPC events from main process.
  No component ever calls agent logic directly.

PRINCIPLE 7 — MULTI-TAB VIA GLOBAL AGENT
  One BrowserAgent manages all tabs via Map<tabId, PlaywrightPage>.
  One shared Playwright BrowserContext (session/cookies shared across tabs).
  Agent creates, switches, closes tabs autonomously as workflow steps.

PRINCIPLE 8 — CREDITGUARD PROTECTS EVERY LLM CALL
  ALL Gemini calls MUST go through CreditGuard.
  CreditGuard enforces: cache, skill-reuse, vision-fallback, batching.
  Direct LLMService calls are FORBIDDEN outside of CreditGuard.

====================================================
SUPABASE SCHEMA
Run this SQL in your Supabase SQL editor before building
====================================================

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Browser history
CREATE TABLE history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url         TEXT NOT NULL,
  title       TEXT,
  favicon_url TEXT,
  visited_at  TIMESTAMPTZ DEFAULT NOW(),
  embedding   VECTOR(768)
);

-- Chat/agent conversation history
CREATE TABLE chat_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('user', 'agent')),
  content      TEXT NOT NULL,
  workflow_id  UUID,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  embedding    VECTOR(768)
);

-- Download history
CREATE TABLE downloads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename      TEXT NOT NULL,
  url           TEXT NOT NULL,
  saved_path    TEXT,
  file_size     BIGINT,
  mime_type     TEXT,
  status        TEXT DEFAULT 'complete',
  downloaded_at TIMESTAMPTZ DEFAULT NOW(),
  embedding     VECTOR(768)
);

-- Agent memory (learned skills per domain)
CREATE TABLE agent_skills (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain      TEXT NOT NULL,
  skill_name  TEXT NOT NULL,
  goal        TEXT NOT NULL,
  steps       JSONB NOT NULL,
  used_count  INTEGER DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  embedding   VECTOR(768)
);

-- LLM prompt cache (protects Gemini credits)
CREATE TABLE prompt_cache (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_hash  TEXT UNIQUE NOT NULL,
  response     TEXT NOT NULL,
  model        TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  expires_at   TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

-- Semantic search function (searches across all tables)
CREATE OR REPLACE FUNCTION semantic_search(
  query_embedding VECTOR(768),
  match_threshold FLOAT DEFAULT 0.7,
  match_count     INT DEFAULT 10
)
RETURNS TABLE (
  source      TEXT,
  id          UUID,
  title       TEXT,
  content     TEXT,
  url         TEXT,
  similarity  FLOAT,
  created_at  TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
  SELECT 'history' as source, id, title, url as content, url,
         1 - (embedding <=> query_embedding) as similarity, visited_at as created_at
  FROM history
  WHERE 1 - (embedding <=> query_embedding) > match_threshold
  UNION ALL
  SELECT 'chat' as source, id, session_id::text as title, content, null as url,
         1 - (embedding <=> query_embedding) as similarity, created_at
  FROM chat_history
  WHERE 1 - (embedding <=> query_embedding) > match_threshold
  UNION ALL
  SELECT 'download' as source, id, filename as title, url as content, url,
         1 - (embedding <=> query_embedding) as similarity, downloaded_at as created_at
  FROM downloads
  WHERE 1 - (embedding <=> query_embedding) > match_threshold
  UNION ALL
  SELECT 'skill' as source, id, skill_name as title, goal as content, null as url,
         1 - (embedding <=> query_embedding) as similarity, created_at
  FROM agent_skills
  WHERE 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- Indexes for vector search performance
CREATE INDEX ON history         USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON chat_history    USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON downloads       USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON agent_skills    USING ivfflat (embedding vector_cosine_ops);

====================================================
COMPLETE FOLDER STRUCTURE
====================================================

veribrowse/
├── main/
│   ├── core/
│   │   ├── EventBus.js              # Node EventEmitter singleton
│   │   ├── TaskSnapshot.js          # Save/restore execution state
│   │   ├── WorkflowEngine.js        # DAG orchestrator (never executes directly)
│   │   └── CreditGuard.js           # LLM call gatekeeper (protects 300 credits)
│   │
│   ├── planner/
│   │   ├── PlannerAgent.js          # LLM → Workflow JSON (plans only, never executes)
│   │   └── WorkflowSchema.js        # Workflow JSON schema + validator
│   │
│   ├── agents/
│   │   ├── BrowserAgent.js          # Owns all Playwright + BrowserView interaction
│   │   └── MemoryAgent.js           # Owns Supabase skill read/write
│   │
│   ├── tools/
│   │   ├── browser/
│   │   │   ├── navigate.js          # playwright.goto(url)
│   │   │   ├── click.js             # playwright.click(selector)
│   │   │   ├── type.js              # playwright.fill(selector, text)
│   │   │   ├── scroll.js            # scroll(direction, amount)
│   │   │   ├── extract.js           # returns clean semantic text + links
│   │   │   ├── screenshot.js        # returns base64 PNG
│   │   │   ├── syncSession.js       # Electron session cookies → Playwright context
│   │   │   ├── newTab.js            # creates new Playwright page + BrowserView
│   │   │   └── switchTab.js         # switches active visible tab
│   │   └── memory/
│   │       ├── saveSkill.js         # stores successful workflow for a domain
│   │       └── recallSkill.js       # semantic search for closest matching skill
│   │
│   ├── services/
│   │   ├── LLMService.js            # Raw Gemini 2.0 Flash wrapper (text + vision)
│   │   ├── EmbeddingService.js      # Gemini text-embedding-004 → VECTOR(768)
│   │   ├── SupabaseService.js       # Supabase client + all DB methods
│   │   └── SessionService.js        # electron.session cookie management
│   │
│   ├── ipc/
│   │   ├── agentHandlers.js         # THIN: agent:run, agent:pause, agent:resume
│   │   ├── browserHandlers.js       # THIN: navigate, tab create/switch/close
│   │   ├── settingsHandlers.js      # THIN: electron-store read/write
│   │   ├── historyHandlers.js       # THIN: Supabase history queries
│   │   ├── downloadHandlers.js      # THIN: download tracking
│   │   └── windowHandlers.js        # THIN: min/max/close
│   │
│   ├── background.js                # Electron entry: window + IPC registration
│   └── preload.js                   # contextBridge: safe IPC API to renderer
│
├── renderer/
│   ├── app/
│   │   ├── layout.js
│   │   ├── page.js                  # Main SPA shell (layer composition)
│   │   └── globals.css
│   │
│   ├── components/
│   │   ├── browser/
│   │   │   ├── BrowserLayer.js      # Positions native BrowserView via IPC
│   │   │   ├── Topbar.js            # Back/Forward/Refresh/URL omnibox
│   │   │   ├── Tabs.js              # Tab strip
│   │   │   └── TabItem.js           # Single tab (title, favicon, close btn)
│   │   │
│   │   ├── agent/
│   │   │   ├── AgentPanel.js        # Sliding side panel container
│   │   │   ├── WorkflowViewer.js    # Live step tree (pending/running/done/failed)
│   │   │   ├── StepCard.js          # Individual step with status + expandable output
│   │   │   ├── ChatInput.js         # User prompt input + send
│   │   │   ├── HITLCard.js          # "Agent needs your help" pause card
│   │   │   └── CreditMeter.js       # Shows remaining estimated Gemini credits
│   │   │
│   │   ├── shell/
│   │   │   ├── Siderail.js          # Left icon nav
│   │   │   └── WindowControls.js    # Frameless window controls
│   │   │
│   │   └── pages/
│   │       ├── HomePage.js          # New tab splash
│   │       ├── HistoryPage.js       # History list + semantic search bar
│   │       ├── DownloadsPage.js     # Download history + search
│   │       └── SettingsPage.js      # API keys + preferences
│   │
│   ├── store/
│   │   ├── tabStore.js              # { tabs[], activeTabId }
│   │   ├── workflowStore.js         # { workflow, steps[], status, needsHuman }
│   │   ├── creditStore.js           # { callsUsed, callsRemaining, lastReset }
│   │   └── uiStore.js               # { agentPanelOpen, currentPage, theme }
│   │
│   └── lib/
│       └── ipc.js                   # Typed wrappers for window.electronAPI
│
├── resources/icons/
├── .env.local                       # Key names only, empty values (template)
├── .eslintrc.json
├── .prettierrc
├── next.config.js
├── tailwind.config.js
└── package.json

====================================================
DATA CONTRACTS (use these shapes everywhere)
====================================================

WORKFLOW OBJECT:
{
  id:        string,   // uuid
  goal:      string,   // original user prompt
  createdAt: number,   // Date.now()
  status:    "pending" | "running" | "paused" | "complete" | "failed",
  steps: [{
    id:        string,
    agent:     "browser" | "memory",
    tool:      string,       // e.g. "navigate", "click", "extract"
    params:    {},
    dependsOn: string[],     // step ids that must complete first
    status:    "pending" | "running" | "done" | "failed" | "skipped",
    result:    {} | null,
    error:     string | null,
    snapshot:  {} | null
  }]
}

TOOL RESPONSE:
{
  success: boolean,
  result:  any,
  error:   string | null
}

TASK SNAPSHOT:
{
  workflowId:      string,
  stepId:          string,
  completedStepIds: string[],
  agentContext: {
    activeTabId: string,
    tabUrls:     Record<string, string>,
    url:         string
  },
  savedAt: number
}

CREDIT GUARD RECORD:
{
  callsUsed:     number,   // stored in electron-store
  callsMade:     [],       // [{ timestamp, type, tokens, cached }]
  budgetLimit:   300,      // hard cap
  warningAt:     250       // emit warning event
}

IPC EVENTS (main → renderer):
  workflow:started       { workflowId, goal }
  workflow:step-start    { workflowId, stepId, tool, params }
  workflow:step-done     { workflowId, stepId, result }
  workflow:step-failed   { workflowId, stepId, error }
  workflow:replanning    { workflowId, reason }
  workflow:needs-human   { workflowId, stepId, reason, screenshotBase64 }
  workflow:complete      { workflowId, summary }
  workflow:failed        { workflowId, error }
  browser:tab-created    { tabId, url, title }
  browser:tab-updated    { tabId, url, title, favicon, isLoading }
  browser:tab-closed     { tabId }
  browser:tab-switched   { tabId }
  credit:updated         { callsUsed, callsRemaining }
  credit:warning         { callsUsed, callsRemaining }

====================================================
CREDITGUARD — FULL IMPLEMENTATION SPEC
====================================================

File: main/core/CreditGuard.js

CreditGuard sits between WorkflowEngine/PlannerAgent and LLMService.
NO code is allowed to call LLMService directly. All calls go through CreditGuard.

STRATEGY 1 — PROMPT CACHE:
  Before any LLM call:
    hash = SHA256(model + prompt)
    Check Supabase prompt_cache WHERE prompt_hash = hash AND expires_at > NOW()
    If found: return cached response, increment cache_hits counter, skip LLM call
    If not found: call LLM, save response to prompt_cache

STRATEGY 2 — SKILL REUSE (saves most credits):
  Before calling PlannerAgent.plan():
    Call MemoryAgent.recall(domain, goal)
    If similarity score > 0.85: use cached skill steps as workflow, skip planning LLM call
    Only call PlannerAgent if no skill found

STRATEGY 3 — VISION FALLBACK:
  Vision (screenshot → LLM) is expensive.
  Only call vision if:
    - extract.js returned less than 100 words of meaningful text, OR
    - BrowserAgent explicitly sets needsVision = true
  Never call vision speculatively.

STRATEGY 4 — RESULT BATCHING:
  When a workflow has 3+ consecutive extract/click steps:
  Collect all intermediate results first, then send ONE LLM call
  with the batched context instead of one call per step.

HARD LIMITS:
  If callsUsed >= 290: block all non-cached LLM calls, emit credit:warning
  If callsUsed >= 300: block ALL LLM calls, throw CreditExhaustedError
  Persist callsUsed in electron-store so count survives app restart

CreditGuard public methods:
  async generate(prompt, options)     → string
  async vision(prompt, screenshot)    → string
  async generateJSON(prompt, schema)  → object
  async embed(text)                   → vector (delegates to EmbeddingService)
  getStats()                          → { callsUsed, callsRemaining, cacheHits }

====================================================
KEY IMPLEMENTATION DETAILS
====================================================

--- main/services/LLMService.js ---
  Only called by CreditGuard. Never called directly by anything else.
  Methods:
    async generate(prompt, options) → string
    async vision(prompt, base64PNG) → string
      (uses Gemini multimodal: inlineData with mimeType image/png)
    async generateJSON(prompt, schema) → object
      (instructs Gemini to return ONLY valid JSON, parses safely with try/catch)
  Config:
    model: "gemini-2.0-flash-exp"
    maxOutputTokens: 2048
    temperature: 0.2 (low = deterministic plans)
  Retry: once on failure, throw CreditGuard-catchable error on second fail
  Read API key from electron-store key "geminiApiKey"

--- main/services/EmbeddingService.js ---
  Uses Gemini text-embedding-004 model (free, doesn't count against flash credits)
  async embed(text) → Float32Array of 768 dimensions
  async embedBatch(texts[]) → Float32Array[]
  Always truncate input text to 2000 chars before embedding

--- main/services/SupabaseService.js ---
  Initialize with SUPABASE_URL and SUPABASE_ANON_KEY from electron-store
  Methods:
    history:
      async addHistory(url, title, favicon)    → inserts + embeds
      async getHistory(limit, offset)          → paginated list
      async searchHistory(query)               → semantic search via embed + RPC
    chat:
      async addMessage(sessionId, role, content, workflowId)
      async getSession(sessionId)
      async getSessions(limit)
    downloads:
      async addDownload(filename, url, path, size, mime)
      async getDownloads(limit, offset)
    skills:
      async saveSkill(domain, skillName, goal, steps)
      async recallSkill(domain, goal)          → returns steps[] or null
    search:
      async semanticSearch(query)              → calls semantic_search RPC
        returns unified results from all tables
    cache:
      async getCached(hash)                    → returns response or null
      async setCached(hash, response, model)   → saves with 7 day expiry

--- main/planner/PlannerAgent.js ---
  async plan(userPrompt, context) → Workflow object
  context = { currentUrl, pageTitle, availableSkills[] }
  System prompt rules:
    - Return ONLY valid JSON matching Workflow schema
    - Steps must declare dependsOn correctly (parallel where possible)
    - Prefer fewer LLM-heavy steps (use extract before vision)
    - Never generate more than 15 steps for a single goal
  Validates output against WorkflowSchema before returning
  If invalid: retry once with error feedback appended to prompt
  async replan(workflow, failedStep, error, screenshot) → Workflow object
    (replans only from the failed step forward, not the whole workflow)

--- main/core/WorkflowEngine.js ---
  async run(workflow) → void
  Builds a dependency graph: Map<stepId, Set<dependsOnStepIds>>
  Execution loop:
    While incomplete steps remain:
      Find all steps where dependsOn are all "done"
      Run those steps in parallel via Promise.all
      Each step:
        1. TaskSnapshot.save()
        2. EventBus.emit('execute-step', step)
        3. Await EventBus result event
        4. Update step status
  On step failure:
    Attempt 1: retry same step once (transient errors)
    Attempt 2: replan via PlannerAgent.replan()
    Attempt 3: emit workflow:failed
  CAPTCHA/login detection (check in BrowserAgent result):
    Pause workflow, emit workflow:needs-human
    Wait for agent:resume IPC event
    Restore TaskSnapshot, continue

--- main/agents/BrowserAgent.js ---
  Listens: EventBus.on('execute-step')
  Only handles steps where step.agent === 'browser'
  Tool routing:
    'navigate'   → tools/browser/navigate.js
    'click'      → tools/browser/click.js
    'type'       → tools/browser/type.js
    'scroll'     → tools/browser/scroll.js
    'extract'    → tools/browser/extract.js
    'screenshot' → tools/browser/screenshot.js
    'vision'     → screenshot + CreditGuard.vision()
    'syncSession'→ tools/browser/syncSession.js
    'newTab'     → tools/browser/newTab.js
    'switchTab'  → tools/browser/switchTab.js
  Tab management:
    tabsMap: Map<tabId, { page: PlaywrightPage, view: BrowserView }>
    activeTabId: string
  CAPTCHA detection:
    After every navigation step, check page content for:
    ["captcha", "verify you're human", "robot", "cloudflare", "recaptcha"]
    If found: return { success: false, needsHuman: true, reason: "captcha" }

--- main/background.js ---
  Creates BrowserWindow: { frame: false, width: 1280, height: 800 }
  On ready:
    1. Launches Playwright chromium (persistent context at userData/playwright)
    2. Creates first tab (tabId: 'tab-1')
    3. Registers all IPC handlers
    4. Loads Next.js renderer
  Tab map: global Map<tabId, { page, view }> accessible to BrowserAgent
  On BrowserView URL change: emits browser:tab-updated to renderer

--- main/preload.js ---
  contextBridge.exposeInMainWorld('electronAPI', {
    agent:    { run, pause, resume },
    browser:  { navigate, createTab, closeTab, switchTab, goBack, goForward, refresh },
    settings: { get, set, getAll },
    history:  { get, search, clear },
    downloads:{ get, search },
    window:   { minimize, maximize, close },
    on:       (channel, callback) => ipcRenderer.on(channel, callback),
    off:      (channel, callback) => ipcRenderer.removeListener(channel, callback)
  })
  Allowed channels for 'on': all workflow:* and browser:* and credit:* events

--- renderer/store/workflowStore.js ---
  State:
    currentWorkflow: null | Workflow
    steps: []
    status: 'idle' | 'running' | 'paused' | 'complete' | 'failed'
    activeStepId: null | string
    needsHuman: false
    humanReason: null
    humanScreenshot: null
    agentMessage: null
  Actions:
    startWorkflow(workflow)
    updateStep(stepId, updates)
    setNeedsHuman(reason, screenshot)
    setComplete(summary)
    setFailed(error)
    reset()
  On mount: register all workflow:* IPC listeners
  On unmount: remove all listeners

--- renderer/components/agent/WorkflowViewer.js ---
  Reads workflowStore
  Renders vertical step list
  Each step shows:
    Icon: clock (pending) | animated spinner (running) | green check (done) | red x (failed)
    Tool name + agent label
    Running: animated left border pulse
    Done: click to expand result output
    Failed: red background + error message
  Between steps when replanning: "🔄 Rethinking..." animated row
  Empty state: "Ready. Type a goal above to start."

--- renderer/components/agent/CreditMeter.js ---
  Reads creditStore
  Shows: "Gemini Credits: [used] / 300"
  Progress bar: green (0-200), yellow (200-270), red (270-300)
  On credit:warning event: pulse animation + tooltip "Running low on credits"
  Position: bottom of AgentPanel

--- renderer/components/pages/SettingsPage.js ---
  Sections:
    AI Configuration:
      Gemini API Key (password field, toggle visibility)
      Supabase URL (text field)
      Supabase Anon Key (password field, toggle visibility)
    Agent Behavior:
      Step delay slider: 300ms to 2000ms (default 800ms)
      Max replan attempts: 1 / 2 / 3 (default 2)
      Enable vision fallback: toggle (default ON)
    Browser:
      Default search: Google / DuckDuckGo / Brave
      Theme: Light / Dark / System
    Save button: calls settings:set, shows green "Saved!" toast for 2s
  Load: calls settings:getAll to populate all fields on mount

--- renderer/components/pages/HistoryPage.js ---
  Top: semantic search input
    On type (debounced 400ms): calls history:search(query)
    Results replace list with similarity-ranked items
  List: paginated history items (20 per page)
    Each: favicon + title + url + relative time
    Click: navigates browser to that URL
    Hover: shows full URL tooltip
  Footer: "Clear all history" button with confirm dialog

====================================================
BUILD ORDER (STRICT — DO NOT DEVIATE)
====================================================

PHASE 1 — FOUNDATION
  1.  package.json
  2.  .eslintrc.json
  3.  .prettierrc
  4.  next.config.js
  5.  tailwind.config.js
  6.  main/services/LLMService.js
  7.  main/services/EmbeddingService.js
  8.  main/services/SupabaseService.js
  9.  main/services/SessionService.js
  10. main/core/EventBus.js
  11. main/core/TaskSnapshot.js
  12. main/core/CreditGuard.js

PHASE 2 — TOOLS
  13. main/tools/browser/navigate.js
  14. main/tools/browser/click.js
  15. main/tools/browser/type.js
  16. main/tools/browser/scroll.js
  17. main/tools/browser/extract.js
  18. main/tools/browser/screenshot.js
  19. main/tools/browser/syncSession.js
  20. main/tools/browser/newTab.js
  21. main/tools/browser/switchTab.js
  22. main/tools/memory/saveSkill.js
  23. main/tools/memory/recallSkill.js

PHASE 3 — PLANNER
  24. main/planner/WorkflowSchema.js
  25. main/planner/PlannerAgent.js

PHASE 4 — AGENTS & ENGINE
  26. main/agents/MemoryAgent.js
  27. main/agents/BrowserAgent.js
  28. main/core/WorkflowEngine.js

PHASE 5 — ELECTRON SHELL
  29. main/ipc/windowHandlers.js
  30. main/ipc/settingsHandlers.js
  31. main/ipc/historyHandlers.js
  32. main/ipc/downloadHandlers.js
  33. main/ipc/browserHandlers.js
  34. main/ipc/agentHandlers.js
  35. main/preload.js
  36. main/background.js

PHASE 6 — RENDERER FOUNDATION
  37. renderer/lib/ipc.js
  38. renderer/store/uiStore.js
  39. renderer/store/tabStore.js
  40. renderer/store/workflowStore.js
  41. renderer/store/creditStore.js

PHASE 7 — RENDERER COMPONENTS
  42. renderer/app/globals.css
  43. renderer/app/layout.js
  44. renderer/components/shell/WindowControls.js
  45. renderer/components/shell/Logo.js        ← COPY EXACTLY from branding section
  46. renderer/components/shell/Splash.js      ← COPY EXACTLY from branding section
  47. renderer/components/shell/Siderail.js
  46. renderer/components/browser/TabItem.js
  47. renderer/components/browser/Tabs.js
  48. renderer/components/browser/Topbar.js
  49. renderer/components/browser/BrowserLayer.js
  50. renderer/components/agent/StepCard.js
  51. renderer/components/agent/WorkflowViewer.js
  52. renderer/components/agent/HITLCard.js
  53. renderer/components/agent/ChatInput.js
  54. renderer/components/agent/CreditMeter.js
  55. renderer/components/agent/AgentPanel.js
  56. renderer/components/pages/HomePage.js
  57. renderer/components/pages/HistoryPage.js
  58. renderer/components/pages/DownloadsPage.js
  59. renderer/components/pages/SettingsPage.js

PHASE 8 — FINAL ASSEMBLY
  60. renderer/app/page.js
  61. .env.local

====================================================
OUTPUT FORMAT FOR EVERY FILE
====================================================

=== FILE: path/to/filename.js ===
[100% complete file — no omissions, no placeholders, no TODOs]
=== END FILE ===

After every file say:
"✅ [filename] done. Say GO for next: [next filename]"

Wait for GO before proceeding.

====================================================
IMPORTANT REMINDERS
====================================================

- EmbeddingService uses text-embedding-004 (free tier, no flash credit cost)
- Gemini text-embedding-004 produces 768-dimension vectors (matches VECTOR(768))
- All Supabase credentials read from electron-store, never hardcoded
- electron-store keys: "geminiApiKey", "supabaseUrl", "supabaseAnonKey"
- .env.local is for development only — production reads from electron-store
- BrowserView bounds must be recalculated whenever AgentPanel opens/closes
- preload.js must sanitize all IPC channel names (whitelist only)
- WorkflowEngine max parallel steps: 3 (prevent Playwright resource exhaustion)

====================================================
BRANDING — USE EXACTLY AS-IS, NEVER CHANGE
====================================================

THEME COLORS (from existing tailwind.config.js — do not invent new colors):
  obsidian:     #050505       ← primary background, all main surfaces
  metallic:     #d1d5db       ← primary text, logo gradient, headings
  glass:        rgba(255,255,255,0.05)  ← card/panel backgrounds
  glass-border: rgba(255,255,255,0.1)  ← all borders and dividers

SHADOWS:
  glass shadow: 0 8px 32px 0 rgba(0,0,0,0.8)  ← all floating panels

ANIMATIONS (already defined in tailwind.config.js — use these class names):
  animate-spin-slow   → 8s linear infinite spin (for logo idle state)
  animate-float       → 3s ease-in-out infinite float

TYPOGRAPHY:
  App name:    "VeriBrowse"  (never change spelling or casing)
  Tagline:     "Secure Intelligence"
  Name style:  font-bold tracking-tighter text-metallic text-5xl (on splash)
  Tagline:     uppercase tracking-[0.4em] text-xs text-gray-500

LOGO — copy this component exactly into renderer/components/shell/Logo.js:
  - SVG-based, uses linearGradient id="metallic-3d" with stops:
      #f3f4f6 (0%) → #9ca3af (50%) → #374151 (100%)
  - 8 petal paths rotated at 0,45,90,135,180,225,270,315 degrees
  - Center circles: outer #1f2937 r=12, inner metallic gradient r=8
  - Glow filter: feGaussianBlur stdDeviation=2.5
  - Props: size (default 48), spinning (bool), float (bool), className
  - spinning mode: rotateY 360 + scale pulse + blue-500/20 blur glow behind
  - float mode: y [0,-10,0] + rotateX [0,5,0]
  - Uses framer-motion (already in deps)

SPLASH — copy this component exactly into renderer/components/shell/Splash.js:
  - Full screen fixed, z-[100], bg-obsidian
  - Logo size=200 with spinning=true
  - Logo animates in: scale 0.5→1, rotateY -180→0, spring stiffness=50 damping=15
  - "VeriBrowse" h1 fades in at delay=1s
  - "Secure Intelligence" p tag below it
  - Bottom gradient line: w-48 h-[1px] via-white/20, scaleX 0→1 at delay=0.5s
  - Auto-dismisses after 1500ms, exit: opacity 0 + scale 1.1 + blur 20px
  - onComplete() called after exit animation (800ms after dismiss)

GLOBAL CSS RULES (add to globals.css, never override):
  .perspective-1000  { perspective: 1000px; }
  .preserve-3d       { transform-style: preserve-3d; }
  All panels/cards:  bg-glass border border-glass-border shadow-glass
  All backgrounds:   bg-obsidian
  All primary text:  text-metallic or text-white
  Secondary text:    text-gray-500
  Accent/active:     text-white bg-white/10
  Never use:         any color outside the defined palette above

====================================================
START NOW
====================================================

Begin with FILE 1: package.json
Include ALL dependencies:
  electron, next, react, react-dom, playwright, @google/generative-ai,
  @supabase/supabase-js, electron-store, zustand, tailwindcss,
  eslint, prettier, uuid, better-sqlite3 (remove — using Supabase instead)

Say GO to receive each next file.