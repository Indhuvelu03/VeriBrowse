# VeriBrowse — FINAL Master Architecture Prompt
> Paste into Antigravity (Claude Sonnet 4, Fast mode). Say GO after each file.

---

```
====================================================
VERIBROWSE — FULL REWRITE FROM SCRATCH
Fellou-inspired Agentic Browser | Eko 3.0 Architecture
Gemini 2.0 Flash | Supabase PostgreSQL + pgvector
====================================================

FULL REWRITE. Ignore all previous code entirely.
Every file must be 100% complete. No placeholders. No TODOs.
Follow build order exactly. Wait for GO before each file.

====================================================
TECH STACK (locked)
====================================================

Desktop Shell:     Electron 28+
UI Framework:      Next.js 14 App Router (renderer)
Browser Engine:    Playwright Chromium
Language:          JavaScript ESM (no TypeScript)
State:             Zustand 4
Styling:           Tailwind CSS + framer-motion
Code Quality:      ESLint + Prettier
LLM:               Gemini 2.0 Flash (@google/generative-ai)
Embeddings:        Gemini text-embedding-004 (free, separate quota)
Database:          Supabase (PostgreSQL + pgvector)
Local Store:       electron-store (API keys + preferences)

====================================================
HYBRID EXECUTION — THE MOST CRITICAL RULE
====================================================

LLM IS CALLED FOR (expensive — guard every call):
  ✅ Planning    → PlannerAgent converts user goal to Workflow JSON
  ✅ Replanning  → PlannerAgent fixes failed steps
  ✅ Vision      → ONLY when DOM text extraction returns < 100 words
  ✅ Summarizing → WorkflowEngine summarizes final results for user
  ✅ Answering   → Direct user questions in chat

LLM IS NEVER CALLED FOR (deterministic — zero LLM):
  ❌ click, type, scroll, navigate  → pure Playwright calls
  ❌ extract DOM text               → pure Playwright evaluate()
  ❌ screenshot capture             → pure Playwright screenshot()
  ❌ tab create / switch / close    → pure Electron + Playwright
  ❌ cookie sync                    → pure session API calls
  ❌ CAPTCHA detection              → pure string .includes() check
  ❌ history/download saving        → pure Supabase insert

VIOLATION OF THIS RULE = the entire architecture is wrong.
BrowserAgent, all tools, and all IPC handlers must have ZERO LLM imports.

====================================================
TAB ARCHITECTURE (Fellou Shadow Workspace model)
====================================================

TWO TAB TYPES — never mix them:

1. USER TABS (human-controlled)
   - Created by user clicking "+" or typing URL
   - Shown in the main tab strip at top
   - User can click, navigate, interact normally
   - Stored in: tabStore.userTabs[]

2. SHADOW TABS (agent-controlled)
   - Created autonomously by BrowserAgent during workflow execution
   - NEVER shown in main tab strip
   - Shown only in AgentPanel as "Agent working in background"
   - User cannot accidentally close them mid-task
   - Stored in: tabStore.shadowTabs[]
   - Destroyed automatically when workflow completes or fails

TAB IMPLEMENTATION:

Main process — background.js maintains:
  userTabsMap:   Map<tabId, { playwrightPage, electronBrowserView }>
  shadowTabsMap: Map<tabId, { playwrightPage }>  ← NO BrowserView (invisible)

All tabs share ONE Playwright BrowserContext → session/cookies shared.

BrowserAgent tab tools (ALL DETERMINISTIC — zero LLM):
  newTab(url, type)     → creates entry in correct map, returns tabId
  switchTab(tabId)      → updates active BrowserView bounds (user tabs only)
  closeTab(tabId)       → destroys page + removes from map
  getAllTabs()          → returns { userTabs[], shadowTabs[] }
  getActiveTab()        → returns current active user tab

IPC events for tab sync (main → renderer):
  browser:user-tab-created    { tabId, url, title }
  browser:user-tab-updated    { tabId, url, title, favicon, isLoading }
  browser:user-tab-closed     { tabId }
  browser:user-tab-switched   { tabId }
  browser:shadow-tab-created  { tabId, url, purpose }
  browser:shadow-tab-updated  { tabId, url, status }
  browser:shadow-tab-closed   { tabId }

====================================================
SUPABASE SCHEMA — run this SQL first
====================================================

-- Enable pgvector
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

-- Chat history
CREATE TABLE chat_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('user','agent')),
  content     TEXT NOT NULL,
  workflow_id UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  embedding   VECTOR(768)
);

-- Downloads
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

-- Agent learned skills
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

-- Unified semantic search across all tables
CREATE OR REPLACE FUNCTION semantic_search(
  query_embedding VECTOR(768),
  match_threshold FLOAT DEFAULT 0.7,
  match_count     INT DEFAULT 10
)
RETURNS TABLE (
  source     TEXT, id UUID, title TEXT,
  content    TEXT, url TEXT,
  similarity FLOAT, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
  SELECT 'history', id, title, url, url,
    1-(embedding<=>query_embedding), visited_at
  FROM history WHERE 1-(embedding<=>query_embedding) > match_threshold
  UNION ALL
  SELECT 'chat', id, session_id::text, content, null,
    1-(embedding<=>query_embedding), created_at
  FROM chat_history WHERE 1-(embedding<=>query_embedding) > match_threshold
  UNION ALL
  SELECT 'download', id, filename, url, url,
    1-(embedding<=>query_embedding), downloaded_at
  FROM downloads WHERE 1-(embedding<=>query_embedding) > match_threshold
  UNION ALL
  SELECT 'skill', id, skill_name, goal, null,
    1-(embedding<=>query_embedding), created_at
  FROM agent_skills WHERE 1-(embedding<=>query_embedding) > match_threshold
  ORDER BY similarity DESC LIMIT match_count;
$$;

CREATE INDEX ON history      USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON chat_history USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON downloads    USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON agent_skills USING ivfflat (embedding vector_cosine_ops);

====================================================
COMPLETE FOLDER STRUCTURE
====================================================

veribrowse/
├── main/
│   ├── core/
│   │   ├── EventBus.js           # Node EventEmitter singleton
│   │   ├── TaskSnapshot.js       # Save/restore step execution state
│   │   ├── WorkflowEngine.js     # DAG orchestrator — never executes directly
│   │   └── CreditGuard.js        # ALL LLM calls go through here — no exceptions
│   │
│   ├── planner/
│   │   ├── PlannerAgent.js       # LLM → Workflow JSON only. Never executes.
│   │   └── WorkflowSchema.js     # JSON schema + validator for Workflow objects
│   │
│   ├── agents/
│   │   ├── BrowserAgent.js       # Routes steps to tools. ZERO LLM calls.
│   │   └── MemoryAgent.js        # Supabase skill read/write. ZERO LLM calls.
│   │
│   ├── tools/
│   │   ├── browser/
│   │   │   ├── navigate.js       # playwright.goto(url) → { success, result, error }
│   │   │   ├── click.js          # playwright.click(selector)
│   │   │   ├── type.js           # playwright.fill(selector, text)
│   │   │   ├── scroll.js         # scroll direction + amount
│   │   │   ├── extract.js        # returns clean text + links (no LLM)
│   │   │   ├── screenshot.js     # returns base64 PNG (no LLM)
│   │   │   ├── syncSession.js    # Electron cookies → Playwright context
│   │   │   ├── newTab.js         # creates user or shadow tab
│   │   │   ├── switchTab.js      # switches active user tab
│   │   │   ├── closeTab.js       # destroys tab by id
│   │   │   └── getAllTabs.js     # returns all user + shadow tabs
│   │   └── memory/
│   │       ├── saveSkill.js      # saves successful workflow for domain
│   │       └── recallSkill.js    # semantic search for matching skill
│   │
│   ├── services/
│   │   ├── LLMService.js         # Raw Gemini 2.0 Flash wrapper (text + vision)
│   │   ├── EmbeddingService.js   # text-embedding-004 → VECTOR(768)
│   │   ├── SupabaseService.js    # All DB methods (history, chat, downloads, skills)
│   │   └── SessionService.js     # electron.session cookie management
│   │
│   ├── ipc/
│   │   ├── agentHandlers.js      # THIN: agent:run/pause/resume → WorkflowEngine
│   │   ├── browserHandlers.js    # THIN: navigate/tab ops → BrowserAgent tools
│   │   ├── settingsHandlers.js   # THIN: electron-store read/write
│   │   ├── historyHandlers.js    # THIN: Supabase history queries
│   │   ├── downloadHandlers.js   # THIN: Supabase download tracking
│   │   └── windowHandlers.js     # THIN: min/max/close
│   │
│   ├── background.js             # Electron entry + tab maps + IPC registration
│   └── preload.js                # contextBridge safe API exposure
│
├── renderer/
│   ├── app/
│   │   ├── layout.js
│   │   ├── page.js               # Layer composition: browser + agent + shell
│   │   └── globals.css
│   │
│   ├── components/
│   │   ├── browser/
│   │   │   ├── BrowserLayer.js   # Positions BrowserView via setBounds IPC
│   │   │   ├── Topbar.js         # Back/Forward/Refresh/Omnibox
│   │   │   ├── Tabs.js           # User tab strip (shadow tabs NOT shown here)
│   │   │   └── TabItem.js        # Single tab component
│   │   │
│   │   ├── agent/
│   │   │   ├── AgentPanel.js     # Sliding side panel (width: 360px)
│   │   │   ├── WorkflowViewer.js # Live step tree with status icons
│   │   │   ├── StepCard.js       # Individual step + expandable output
│   │   │   ├── ShadowTabBar.js   # Shows agent's shadow tabs (NEW)
│   │   │   ├── ChatInput.js      # User goal input
│   │   │   ├── HITLCard.js       # Pause card for CAPTCHA/login walls
│   │   │   └── CreditMeter.js    # Gemini credit usage bar
│   │   │
│   │   ├── shell/
│   │   │   ├── Logo.js           # ← COPY EXACT from branding section below
│   │   │   ├── Splash.js         # ← COPY EXACT from branding section below
│   │   │   ├── Siderail.js       # Left icon nav
│   │   │   └── WindowControls.js # Frameless min/max/close
│   │   │
│   │   └── pages/
│   │       ├── HomePage.js       # New tab splash
│   │       ├── HistoryPage.js    # History + semantic search
│   │       ├── DownloadsPage.js  # Downloads + search
│   │       └── SettingsPage.js   # API keys + preferences
│   │
│   ├── store/
│   │   ├── tabStore.js           # { userTabs[], shadowTabs[], activeTabId }
│   │   ├── workflowStore.js      # { workflow, steps[], status, needsHuman }
│   │   ├── creditStore.js        # { callsUsed, callsRemaining, cacheHits }
│   │   └── uiStore.js            # { agentPanelOpen, currentPage, theme }
│   │
│   └── lib/
│       └── ipc.js                # Typed wrappers for window.electronAPI
│
├── resources/icons/
├── .env.local
├── .eslintrc.json
├── .prettierrc
├── next.config.js
├── tailwind.config.js
└── package.json

====================================================
DATA CONTRACTS (use everywhere — never deviate)
====================================================

WORKFLOW:
{
  id: string,           // uuid
  goal: string,         // original user prompt
  createdAt: number,
  status: "pending"|"running"|"paused"|"complete"|"failed",
  steps: [{
    id: string,
    agent: "browser"|"memory",
    tool: string,       // navigate/click/type/scroll/extract/screenshot/
                        // vision/syncSession/newTab/switchTab/closeTab/
                        // getAllTabs/saveSkill/recallSkill
    params: {},
    dependsOn: string[],
    status: "pending"|"running"|"done"|"failed"|"skipped",
    result: {}|null,
    error: string|null,
    isShadowTab: boolean  // true if this step runs in a shadow tab
  }]
}

TOOL RESPONSE (every tool must return this shape):
{ success: boolean, result: any, error: string|null }

TASK SNAPSHOT:
{
  workflowId: string,
  stepId: string,
  completedStepIds: string[],
  agentContext: {
    activeUserTabId: string,
    userTabUrls: Record<string, string>,
    shadowTabUrls: Record<string, string>
  },
  savedAt: number
}

TAB OBJECT (userTabs and shadowTabs both use this shape):
{
  id: string,           // uuid prefixed: "user-" or "shadow-"
  url: string,
  title: string,
  favicon: string|null,
  isLoading: boolean,
  type: "user"|"shadow",
  purpose: string|null  // shadow tabs only: why agent created this tab
}

====================================================
CREDITGUARD SPEC
====================================================

File: main/core/CreditGuard.js
THE ONLY GATEWAY to LLMService. Nothing calls LLMService directly.

4 PROTECTION STRATEGIES (all active):

1. PROMPT CACHE:
   hash = SHA256(model + prompt)
   Check Supabase prompt_cache WHERE prompt_hash=hash AND expires_at>NOW()
   Hit → return cached, no LLM call
   Miss → call LLM, save to cache with 7-day expiry

2. SKILL REUSE (biggest credit saver):
   Before PlannerAgent.plan():
     Check MemoryAgent.recall(domain, goal)
     If similarity >= 0.85 → use cached skill, skip entire planning LLM call
     Only call PlannerAgent if no skill found

3. VISION FALLBACK (vision is expensive):
   Only trigger vision (screenshot → LLM) when:
     extract.js result has < 100 meaningful words
   Never call vision speculatively or proactively

4. RESULT BATCHING:
   3+ consecutive extract steps → collect all results first
   Send ONE LLM call with batched context
   Never one LLM call per extract step

HARD LIMITS:
   callsUsed >= 250 → emit credit:warning to renderer
   callsUsed >= 290 → block all non-cached calls, emit credit:critical
   callsUsed >= 300 → throw CreditExhaustedError, block everything
   Persist callsUsed in electron-store (survives app restart)

Public API:
  async generate(prompt, options) → string
  async vision(prompt, screenshotBase64) → string
  async generateJSON(prompt, schema) → object
  async embed(text) → vector  // delegates to EmbeddingService (free quota)
  getStats() → { callsUsed, callsRemaining, cacheHits, skillHits }

====================================================
KEY FILE SPECS
====================================================

--- main/services/LLMService.js ---
ONLY called by CreditGuard. No other file imports this.
  generate(prompt, options) → string
  vision(prompt, base64PNG) → string
    Uses Gemini multimodal: { inlineData: { mimeType: "image/png", data: base64 } }
  generateJSON(prompt, schema) → object
    Instructs: "Return ONLY valid JSON. No markdown. No explanation."
    Parses with try/catch. Retries once if parse fails.
Config:
  model: "gemini-2.0-flash-exp"
  maxOutputTokens: 2048
  temperature: 0.2
API key: read from electron-store key "geminiApiKey"
Retry once on network error. Throw on second failure.

--- main/services/EmbeddingService.js ---
Uses "text-embedding-004" (free quota, NOT flash credits — never goes through CreditGuard)
  embed(text) → Float32Array[768]
  embedBatch(texts[]) → Float32Array[][]
Truncate all input to 2000 chars before embedding.
API key: same "geminiApiKey" from electron-store.

--- main/services/SupabaseService.js ---
Read SUPABASE_URL + SUPABASE_ANON_KEY from electron-store.
Methods:
  history:   addHistory(url,title,favicon), getHistory(limit,offset), searchHistory(query)
  chat:      addMessage(sessionId,role,content,workflowId), getSession(id), getSessions(limit)
  downloads: addDownload(filename,url,path,size,mime), getDownloads(limit,offset)
  skills:    saveSkill(domain,skillName,goal,steps), recallSkill(domain,goal)
  search:    semanticSearch(query) → calls semantic_search RPC → unified results
  cache:     getCached(hash), setCached(hash,response,model)
All methods that store text must also call EmbeddingService.embed() and store vector.

--- main/core/EventBus.js ---
Singleton Node.js EventEmitter.
Export single instance: export default new EventEmitter()
Max listeners: 50 (prevent memory leak warnings)

--- main/core/TaskSnapshot.js ---
save(workflowId, stepId, agentContext) → void  (stores in memory Map)
restore(workflowId) → snapshot | null
clear(workflowId) → void
Snapshots stored in-memory Map (not DB — speed critical)

--- main/core/WorkflowEngine.js ---
async run(workflow) → void
  1. Emit workflow:started to renderer
  2. Build dependency graph from step.dependsOn
  3. Loop: find all steps whose dependsOn are all "done"
  4. Run independent steps in parallel (max 3 at once via Promise.all)
  5. Before each step: TaskSnapshot.save()
  6. Dispatch via EventBus.emit('execute-step', step)
  7. Await result via EventBus promise wrapper
  8. Update step status, emit workflow:step-done or workflow:step-failed

On step failure:
  Attempt 1: retry same step (transient network errors)
  Attempt 2: PlannerAgent.replan(workflow, failedStep, error, screenshot)
             merge new steps, resume from snapshot
  Attempt 3: emit workflow:failed, stop

CAPTCHA/login detected (from BrowserAgent result.needsHuman):
  Pause execution, emit workflow:needs-human with screenshot
  Wait for agent:resume IPC (user clicked Resume button)
  Restore TaskSnapshot, continue from paused step

On complete:
  Call CreditGuard.generate() to summarize results for user (1 LLM call)
  Emit workflow:complete with summary
  Save successful workflow to MemoryAgent (for future skill reuse)

--- main/planner/PlannerAgent.js ---
ONLY file allowed to call CreditGuard for planning. Zero direct tool/agent imports.
async plan(userPrompt, context) → Workflow object
  context = { currentUrl, pageTitle, domain, availableSkills[] }
  System prompt:
    "You are a browser automation planner.
     Return ONLY a valid JSON Workflow object.
     Prefer parallel steps (set dependsOn correctly).
     Use shadow tabs for background research tasks (set isShadowTab: true).
     Use extract before vision. Max 15 steps.
     Available tools: navigate, click, type, scroll, extract,
     screenshot, vision, newTab, switchTab, closeTab, saveSkill, recallSkill"
  Validate against WorkflowSchema. Retry once with error if invalid.

async replan(workflow, failedStep, error, screenshot) → Workflow object
  Replans only steps AFTER the failed step.
  Passes: original goal + completed steps + failed step + error message
  If screenshot provided: uses CreditGuard.vision() to analyze page state

--- main/agents/BrowserAgent.js ---
⚠️ ZERO LLM IMPORTS. ZERO CreditGuard imports. Pure deterministic routing only.
Listens: EventBus.on('execute-step') where step.agent === 'browser'
Routes step.tool → correct tool file.
Manages: userTabsMap + shadowTabsMap (passed in from background.js context)
Reports: EventBus.emit('step-result', { stepId, toolResponse })
CAPTCHA check after every navigate (pure string matching):
  keywords = ['captcha','verify you\'re human','robot','cloudflare','recaptcha']
  if page title/text includes any keyword:
    return { success: false, needsHuman: true, reason: 'captcha detected' }

--- main/agents/MemoryAgent.js ---
⚠️ ZERO LLM IMPORTS. Pure Supabase calls only.
Listens: EventBus.on('execute-step') where step.agent === 'memory'
saveSkill: calls SupabaseService.saveSkill()
recallSkill: calls SupabaseService.recallSkill() → returns steps[] or null

--- main/background.js ---
Creates BrowserWindow: { frame:false, width:1280, height:800, minWidth:800 }
On ready:
  1. Launch Playwright: chromium.launch({ headless: false })
  2. Create shared BrowserContext (persistent userData path)
  3. Create initial user tab (id: 'user-tab-1', url: 'about:blank')
  4. Initialize all services: LLMService, EmbeddingService, SupabaseService
  5. Initialize CreditGuard, WorkflowEngine, BrowserAgent, MemoryAgent
  6. Register all IPC handlers
  7. Load Next.js renderer URL
Global maps (accessible to BrowserAgent):
  global.userTabsMap   = Map<tabId, { playwrightPage, electronBrowserView }>
  global.shadowTabsMap = Map<tabId, { playwrightPage }>  // no BrowserView!
On BrowserView 'did-navigate': emit browser:user-tab-updated to renderer
On BrowserView 'page-title-updated': emit browser:user-tab-updated

--- main/preload.js ---
contextBridge.exposeInMainWorld('electronAPI', {
  agent:    { run:(prompt)=>ipc('agent:run',prompt),
              pause:()=>ipc('agent:pause'),
              resume:()=>ipc('agent:resume') },
  browser:  { navigate:(tabId,url)=>ipc('browser:navigate',{tabId,url}),
              createTab:(url)=>ipc('browser:create-tab',{url}),
              closeTab:(tabId)=>ipc('browser:close-tab',{tabId}),
              switchTab:(tabId)=>ipc('browser:switch-tab',{tabId}),
              goBack:(tabId)=>ipc('browser:go-back',{tabId}),
              goForward:(tabId)=>ipc('browser:go-forward',{tabId}),
              refresh:(tabId)=>ipc('browser:refresh',{tabId}) },
  settings: { get:(key)=>ipc('settings:get',key),
              set:(key,val)=>ipc('settings:set',{key,val}),
              getAll:()=>ipc('settings:get-all') },
  history:  { get:(limit,offset)=>ipc('history:get',{limit,offset}),
              search:(query)=>ipc('history:search',{query}),
              clear:()=>ipc('history:clear') },
  downloads:{ get:(limit,offset)=>ipc('downloads:get',{limit,offset}) },
  window:   { minimize:()=>ipc('window:minimize'),
              maximize:()=>ipc('window:maximize'),
              close:()=>ipc('window:close') },
  on:(channel,cb)=>{ ipcRenderer.on(channel,(_,data)=>cb(data)) },
  off:(channel,cb)=>{ ipcRenderer.removeListener(channel,cb) }
})
Allowed 'on' channels whitelist:
  workflow:started, workflow:step-start, workflow:step-done,
  workflow:step-failed, workflow:replanning, workflow:needs-human,
  workflow:complete, workflow:failed,
  browser:user-tab-created, browser:user-tab-updated,
  browser:user-tab-closed, browser:user-tab-switched,
  browser:shadow-tab-created, browser:shadow-tab-updated,
  browser:shadow-tab-closed,
  credit:updated, credit:warning, credit:critical

--- renderer/store/tabStore.js (Zustand) ---
State:
  userTabs: TabObject[]        // shown in tab strip
  shadowTabs: TabObject[]      // shown in AgentPanel ShadowTabBar only
  activeTabId: string|null
Actions:
  addUserTab(tab), updateUserTab(tabId, updates), removeUserTab(tabId)
  addShadowTab(tab), updateShadowTab(tabId, updates), removeShadowTab(tabId)
  setActiveTab(tabId)
On mount: register all browser:user-tab-* and browser:shadow-tab-* IPC listeners
On unmount: clean up all listeners

--- renderer/store/workflowStore.js (Zustand) ---
State:
  currentWorkflow: Workflow|null
  steps: WorkflowStep[]
  status: 'idle'|'running'|'paused'|'complete'|'failed'
  activeStepId: string|null
  needsHuman: boolean
  humanReason: string|null
  humanScreenshot: string|null  // base64 PNG
  summary: string|null
Actions:
  startWorkflow, updateStep, setNeedsHuman, setComplete, setFailed, reset
IPC: register all workflow:* listeners on mount

--- renderer/components/agent/ShadowTabBar.js ---
Reads tabStore.shadowTabs
Shows inside AgentPanel below WorkflowViewer
Renders each shadow tab as a small pill:
  [spinner] "Agent researching: amazon.com" [url truncated]
When shadowTabs is empty: renders nothing
Title: "Agent Workspace" shown only when shadowTabs.length > 0

--- renderer/components/agent/WorkflowViewer.js ---
Reads workflowStore
Vertical step list, each step shows:
  pending  → gray clock icon
  running  → animated blue spinner + left border pulse animation
  done     → green checkmark, click to expand result
  failed   → red X + error message in red text
  skipped  → gray dash
Between steps when replanning: "🔄 Rethinking..." animated row
Shadow tab steps: show small ghost icon to indicate background execution
Empty state: "Enter a goal above to get started."

--- renderer/components/browser/BrowserLayer.js ---
On mount: call ipc.browser.setBounds with current window dimensions minus
  { top: topbarHeight, left: siderailWidth,
    right: agentPanelOpen ? 360 : 0, bottom: 0 }
On agentPanelOpen change: recalculate and update bounds immediately
On window resize: recalculate bounds via ResizeObserver
CRITICAL: bounds must always exclude the AgentPanel width when panel is open

--- renderer/components/pages/SettingsPage.js ---
Sections:
  AI: Gemini API Key (password+toggle), model display (read-only: gemini-2.0-flash-exp)
  Database: Supabase URL, Supabase Anon Key (password+toggle)
  Agent: step delay slider 300ms-2000ms, max replan attempts 1-3, vision toggle
  Browser: default search (Google/DuckDuckGo/Brave), theme (Light/Dark/System)
Save: settings:set IPC → green "Saved!" toast 2s
Load: settings:getAll on mount → populate all fields

====================================================
BRANDING — COPY EXACTLY, NEVER CHANGE
====================================================

TAILWIND THEME (tailwind.config.js must include):
  colors:
    obsidian:     '#050505'
    metallic:     '#d1d5db'
    glass:        'rgba(255,255,255,0.05)'
    glass-border: 'rgba(255,255,255,0.1)'
  boxShadow:
    glass: '0 8px 32px 0 rgba(0,0,0,0.8)'
  animation:
    spin-slow: 'spin 8s linear infinite'
    float: 'float 3s ease-in-out infinite'
  keyframes:
    float: { '0%,100%': {transform:'translateY(0)'}, '50%': {transform:'translateY(-10px)'} }

GLOBAL CSS (globals.css must include):
  .perspective-1000 { perspective: 1000px; }
  .preserve-3d { transform-style: preserve-3d; }

UI RULES (never use colors outside this palette):
  All backgrounds:     bg-obsidian (#050505)
  All panels/cards:    bg-glass border border-glass-border shadow-glass
  All primary text:    text-metallic or text-white
  Secondary text:      text-gray-500
  Active/hover states: bg-white/10
  Accent:              text-white
  Never use: blue, purple, green, red EXCEPT for status indicators:
    running: blue-500, done: green-500, failed: red-500, warning: yellow-500

APP NAME: "VeriBrowse" — never change spelling or casing
TAGLINE:  "Secure Intelligence"

Logo.js — copy this EXACTLY into renderer/components/shell/Logo.js:
-----------------------------------------------------------------
import React from 'react';
import { motion } from 'framer-motion';

export const Logo = ({ size = 48, spinning = false, float = false, className = '' }) => {
  const spinTransition = { repeat: Infinity, duration: 3, ease: 'linear' };
  const floatTransition = { repeat: Infinity, repeatType: 'reverse', duration: 2, ease: 'easeInOut' };
  return (
    <div className={`perspective-1000 ${className}`} style={{ width: size, height: size }}>
      <motion.div
        animate={
          spinning ? { rotateY: 360, rotateX: [0,10,0,-10,0], scale: [1,1.1,1] }
          : float ? { y: [0,-10,0], rotateX: [0,5,0] } : {}
        }
        transition={spinning ? spinTransition : float ? floatTransition : {}}
        className="relative flex items-center justify-center w-full h-full preserve-3d"
        style={{ transformStyle: 'preserve-3d' }}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]" style={{ backfaceVisibility: 'visible' }}>
          <defs>
            <linearGradient id="metallic-3d" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f3f4f6" />
              <stop offset="50%" stopColor="#9ca3af" />
              <stop offset="100%" stopColor="#374151" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
              <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <g transform="translate(50,50)">
            {[0,45,90,135,180,225,270,315].map((angle) => (
              <path key={angle} d="M0,0 C20,-30 40,-30 40,0 C40,30 20,30 0,0"
                fill="url(#metallic-3d)" transform={`rotate(${angle}) translate(0,-5)`}
                className="opacity-90" style={{ filter: 'blur(0.5px)' }} />
            ))}
            <circle cx="0" cy="0" r="12" fill="#1f2937" />
            <circle cx="0" cy="0" r="8" fill="url(#metallic-3d)" opacity="0.8" />
          </g>
        </svg>
        {spinning && (
          <motion.div className="absolute inset-0 rounded-full bg-blue-500/20 blur-xl"
            animate={{ scale:[1,1.2,1], opacity:[0.3,0.6,0.3] }}
            transition={{ duration:2, repeat:Infinity }} />
        )}
      </motion.div>
    </div>
  );
};
-----------------------------------------------------------------

Splash.js — copy this EXACTLY into renderer/components/shell/Splash.js:
-----------------------------------------------------------------
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Logo } from './Logo';

export const Splash = ({ onComplete }) => {
  const [isVisible, setIsVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onComplete, 800);
    }, 1500);
    return () => clearTimeout(timer);
  }, [onComplete]);
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
          exit={{ opacity:0, scale:1.1, filter:'blur(20px)' }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-obsidian text-white">
          <motion.div initial={{ scale:0.5, rotateY:-180, opacity:0 }}
            animate={{ scale:1, rotateY:0, opacity:1 }}
            transition={{ type:'spring', stiffness:50, damping:15, duration:1.5 }}>
            <Logo size={200} spinning />
          </motion.div>
          <motion.div initial={{ y:20, opacity:0 }} animate={{ y:0, opacity:1 }}
            transition={{ delay:1, duration:0.8 }} className="mt-12 text-center">
            <h1 className="text-5xl font-bold tracking-tighter text-metallic">VeriBrowse</h1>
            <p className="mt-2 text-gray-500 uppercase tracking-[0.4em] text-xs">Secure Intelligence</p>
          </motion.div>
          <motion.div className="absolute bottom-20 w-48 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"
            initial={{ scaleX:0 }} animate={{ scaleX:1 }}
            transition={{ delay:0.5, duration:2 }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
};
-----------------------------------------------------------------

====================================================
BUILD ORDER (strict — do not deviate)
====================================================

PHASE 1 — FOUNDATION (12 files)
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

PHASE 2 — TOOLS (13 files — ZERO LLM in any of these)
  13. main/tools/browser/navigate.js
  14. main/tools/browser/click.js
  15. main/tools/browser/type.js
  16. main/tools/browser/scroll.js
  17. main/tools/browser/extract.js
  18. main/tools/browser/screenshot.js
  19. main/tools/browser/syncSession.js
  20. main/tools/browser/newTab.js
  21. main/tools/browser/switchTab.js
  22. main/tools/browser/closeTab.js
  23. main/tools/browser/getAllTabs.js
  24. main/tools/memory/saveSkill.js
  25. main/tools/memory/recallSkill.js

PHASE 3 — PLANNER (2 files)
  26. main/planner/WorkflowSchema.js
  27. main/planner/PlannerAgent.js

PHASE 4 — AGENTS + ENGINE (3 files)
  28. main/agents/MemoryAgent.js
  29. main/agents/BrowserAgent.js    ← verify: zero LLM imports
  30. main/core/WorkflowEngine.js

PHASE 5 — ELECTRON SHELL (8 files)
  31. main/ipc/windowHandlers.js
  32. main/ipc/settingsHandlers.js
  33. main/ipc/historyHandlers.js
  34. main/ipc/downloadHandlers.js
  35. main/ipc/browserHandlers.js
  36. main/ipc/agentHandlers.js
  37. main/preload.js
  38. main/background.js

PHASE 6 — RENDERER FOUNDATION (6 files)
  39. renderer/lib/ipc.js
  40. renderer/store/uiStore.js
  41. renderer/store/tabStore.js
  42. renderer/store/workflowStore.js
  43. renderer/store/creditStore.js
  44. renderer/app/globals.css

PHASE 7 — RENDERER COMPONENTS (18 files)
  45. renderer/app/layout.js
  46. renderer/components/shell/WindowControls.js
  47. renderer/components/shell/Logo.js           ← COPY EXACT from branding
  48. renderer/components/shell/Splash.js         ← COPY EXACT from branding
  49. renderer/components/shell/Siderail.js
  50. renderer/components/browser/TabItem.js
  51. renderer/components/browser/Tabs.js
  52. renderer/components/browser/Topbar.js
  53. renderer/components/browser/BrowserLayer.js
  54. renderer/components/agent/StepCard.js
  55. renderer/components/agent/WorkflowViewer.js
  56. renderer/components/agent/ShadowTabBar.js
  57. renderer/components/agent/HITLCard.js
  58. renderer/components/agent/ChatInput.js
  59. renderer/components/agent/CreditMeter.js
  60. renderer/components/agent/AgentPanel.js
  61. renderer/components/pages/HomePage.js
  62. renderer/components/pages/HistoryPage.js
  63. renderer/components/pages/DownloadsPage.js
  64. renderer/components/pages/SettingsPage.js

PHASE 8 — FINAL ASSEMBLY (2 files)
  65. renderer/app/page.js
  66. .env.local  (key names only, empty values)

====================================================
OUTPUT FORMAT
====================================================

=== FILE: path/to/file.js ===
[complete file — nothing omitted]
=== END FILE ===

After each file:
"✅ [filename] complete. Say GO for: [next file]"

Wait for GO before proceeding.

====================================================
SELF-CHECK — verify before outputting each file
====================================================

For tools (files 13-25):        Does this file import LLMService or CreditGuard? → REMOVE IT
For BrowserAgent (file 29):     Does this file import LLMService or CreditGuard? → REMOVE IT
For IPC handlers (files 31-36): Does this file contain business logic? → MOVE IT to Engine/Agent
For all UI components:          Does this use any color not in the palette? → FIX IT
For Logo.js (file 47):          Is this identical to the branding section? → VERIFY
For Splash.js (file 48):        Is this identical to the branding section? → VERIFY

====================================================
BEGIN
====================================================

Start with FILE 1: package.json
Dependencies must include:
  electron, next, react, react-dom, playwright, @google/generative-ai,
  @supabase/supabase-js, electron-store, zustand, tailwindcss,
  framer-motion, eslint, prettier, uuid

Say GO to receive the next file.
```
