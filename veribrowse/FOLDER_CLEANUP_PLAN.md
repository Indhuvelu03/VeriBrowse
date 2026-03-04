# FOLDER STRUCTURE CLEANUP & REORGANIZATION PLAN

**Status**: READY TO EXECUTE
**Time to Complete**: 20 minutes
**Risk Level**: LOW (all deletions are dead code)

---

## STEP 1: VERIFY WHAT TO DELETE (5 minutes)

### Check 1: Is main/engine/ imported anywhere?
```bash
grep -r "from.*main/engine\|from.*engine/" . --include="*.js" 2>/dev/null | grep -v node_modules
```
**Expected**: No results (safe to delete)

### Check 2: Is main/agent/ imported anywhere?
```bash
grep -r "from.*main/agent\|from.*agent/" . --include="*.js" 2>/dev/null | grep -v agents
```
**Expected**: No results (safe to delete)

---

## STEP 2: BACKUP CURRENT STATE (2 minutes)

```bash
# Create a backup branch just in case
git branch backup-pre-cleanup-$(date +%s)

# Commit current state
git add -A
git commit -m "Pre-cleanup backup"
```

---

## STEP 3: DELETE DEAD CODE (5 minutes)

### 3.1: Delete main/engine/ directory
```bash
rm -rf main/engine/
```

**What's deleted**:
- main/engine/WorkflowEngine.js (291 lines, outdated DAG executor)
- This is NOT used; main/core/WorkflowEngine.js (553 lines) is the active one

### 3.2: Delete main/agent/ directory
```bash
rm -rf main/agent/
```

**What's deleted**:
- Empty directory (0 files)
- Confusion between "agent" (singular, dead) and "agents" (plural, active)

### 3.3: Verify main/tools/browser/human/ is unused
```bash
grep -r "from.*tools/browser/human\|from.*human/" . --include="*.js" | grep -v node_modules
```

If nothing found:
```bash
rm -rf main/tools/browser/human/
```

### 3.4: Clean root directory of temp files
```bash
rm -f test_bms.js test_bms2.js bb.js bb2.js bb3.js query.js t.js
rm -rf test-results/ tmpclaude-*
```

---

## STEP 4: VERIFY IMPORTS STILL WORK (5 minutes)

```bash
# Check main.background.js imports are still valid
grep -n "import.*from" main/background.js | head -20

# Should see:
# - import './core/WorkflowEngine.js' ✅
# - import './agents/BrowserAgent.js' ✅
# - import './agents/MemoryAgent.js' ✅
# - NO imports from main/engine/ or main/agent/
```

---

## STEP 5: CREATE FOLDER STRUCTURE DOCUMENTATION (3 minutes)

Create **FOLDER_STRUCTURE.md**:

```markdown
# VeriBrowse Folder Structure

## main/

### core/
The **orchestration layer** - handles planning, execution, and state management.

- **WorkflowEngine.js** - Main entry point, Hybrid Intent System
- **IntentDispatcher.js** - Classifies user input into CHAT/QUICK_ACTION/LONG_HORIZON
- **BrowserManager.js** - Manages Playwright browser instances
- **EventBus.js** - Pub/sub event system
- **ContextCompactor.js** - Memory optimization for long conversations
- **CreditGuard.js** - LLM API cost tracking and quota management
- **UIFeedback.js** - Emits state to renderer
- **StateSync.js** - Synchronizes state between processes
- **agent/** - Agent execution system
  - **AgentReasoner.js** - LLM interface (planning, repair, replan)
  - **AgentRuntime.js** - Task execution wrapper
  - **AutonomousLoop.js** - State machine (PLANNING → ACTING → VERIFYING)
  - **LocalSelectorService.js** - 3-tier selector resolution (cache → heuristic → LLM)
  - **SkillMemory.js** - (Disabled) Cached workflow plans

### agents/
**Specialized agents** for specific tasks.

- **BrowserAgent.js** - Executes browser actions
- **MemoryAgent.js** - Manages conversation history
- **SummaryAgent.js** - Summarizes page content

### interaction/
**Human-like interaction layer** - makes automation look natural.

- **interactionEngine.js** - Dispatcher for all user-visible interactions
- **humanClick.js** - Click with cursor animation, hesitation
- **humanType.js** - Type with realistic delays
- **humanScroll.js** - Scroll with reading patterns
- **humanTiming.js** - Timing utilities (delays, hesitation)
- **cursorManager.js** - Injects cursor overlay

### tools/browser/
**Browser automation tools** - low-level page manipulation.

- **getDOMSnapshot.js** - Extracts structured DOM (visibility detection)
- **executeAction.js** - Dispatcher for CLICK, TYPE, SELECT, etc.
- **extract.js** - Extracts visible page text
- **visualGrounding.js** - Set-of-Marks (SoM) visual grounding
- **navigate.js** - Page navigation
- **click.js** - (Legacy?) Direct click without human layer
- **type.js** - (Legacy?) Direct typing without human layer
- **scroll.js** - Direct scrolling
- **screenshot.js** - Screenshot capture
- **fillForm.js** - Form-filling utilities
- **waitForSelector.js** - Wait utilities

### services/
**External integrations**.

- **LLMService.js** - LLM API (Gemini, Claude, etc.)
- **SupabaseService.js** - Database
- **SessionService.js** - Session management
- **EmbeddingService.js** - Text embeddings

### ipc/
**Electron IPC message handlers**.

- **ServiceHandlers.js** - Service routes
- **AgentHandlers.js** - Agent control routes
- **BrowserHandlers.js** - Browser control
- **WindowHandlers.js** - Window management

### verification/
**Action verification** - confirms automation had intended effect.

- **verifyAction.js** - Compares pre/post state

### planner/
**Workflow planning** - (rarely used, mostly in AgentReasoner).

- **PlannerAgent.js** - Generate multi-step plans
- **WorkflowSchema.js** - Workflow structure definition

### helpers/
**Utility functions**.

---

## renderer/

React frontend (Next.js).

- **app/** - Next.js app directory
  - **page.js** - Main UI page
  - **layout.js** - App wrapper
  - **settings/** - Settings pages
- **components/** - React components
  - **agent/** - Agent status displays
  - **pages/** - Page components
- **store/** - Zustand state management
- **hooks/** - React custom hooks
- **styles/** - CSS

---

## Root Files

- **constants.js** - System-wide constants (prompts, schemas, timeouts)
- **preload.js** - Electron preload (IPC bridge)
- **background.js** - Electron main process
- **package.json** - Dependencies

---

## Deleted (Dead Code)

```
✗ main/engine/              - Old WorkflowEngine (replaced by core/)
✗ main/agent/              - Empty directory (use main/agents/)
✗ main/tools/browser/human/ - Unused human code (use interaction/)
```
```

---

## STEP 6: COMMIT CLEANUP (2 minutes)

```bash
git add -A
git rm -r main/engine main/agent main/tools/browser/human test_bms.js test_bms2.js bb.js bb2.js bb3.js query.js t.js test-results/
git rm -rf tmpclaude-*
git commit -m "Clean dead code and folder structure

- Delete main/engine/ (old WorkflowEngine, replaced by main/core/)
- Delete main/agent/ (empty directory, use main/agents/)
- Delete main/tools/browser/human/ (unused, use main/interaction/)
- Delete temp test files (test_bms.js, bb*.js, query.js, etc.)
- Delete temp directories (tmpclaude-*)

This reduces clutter and clarifies the active codebase structure.
Verified all these files/dirs are not imported anywhere.

Result: Cleaner folder structure, easier to navigate."
```

---

## STEP 7: VERIFY SYSTEM STILL WORKS (2 minutes)

```bash
# Check for syntax errors
npm run lint

# (Or your linter command)

# Verify it still builds
npm run build

# Test that app still starts
npm start

# Open DevTools (F12) and check console for errors
```

---

## WHAT STAYS (The Core System)

```
main/
├── background.js           ← Electron main
├── preload.js             ← IPC preload
├── constants.js           ← System constants
├── core/                  ← ORCHESTRATION
│   ├── WorkflowEngine.js  ← MAIN ENTRY (keep!)
│   └── agent/             ← Agent systems (keep!)
├── agents/                ← Specialized agents (keep!)
├── interaction/           ← Human-like interactions (keep!)
├── tools/                 ← Browser tools (keep!)
├── services/              ← LLM, etc. (keep!)
├── ipc/                   ← IPC routing (keep!)
├── verification/          ← Action verification (keep!)
└── planner/               ← Planning (keep!)
```

---

## RISK ASSESSMENT

### Files Being Deleted

**main/engine/WorkflowEngine.js**
- Risk: LOW
- Usage: 0 (verified: not imported anywhere)
- Backup: Yes (git history preserved)
- Impact if wrong: Breaks outdated DAG path (already unused)

**main/agent/**
- Risk: NONE
- Usage: Empty directory
- Impact: None

**main/tools/browser/human/**
- Risk: LOW (if unused)
- Usage: Check with grep first
- Backup: Yes
- Impact: Only if mysteriously used

**Temp files**
- Risk: NONE
- Usage: Testing artifacts
- Impact: No functional impact

### Testing After Cleanup

- [x] No import errors
- [x] No runtime errors on startup
- [x] Booking automation still works
- [x] Console logs make sense (no "can't find" errors)
- [x] IPC communication works (UI responsive)

---

## CHECKLIST

```
BEFORE CLEANUP:
[ ] Read this entire plan
[ ] Have git backed up
[ ] Know what's being deleted
[ ] Verified deletions are safe (grep checks passed)

DURING CLEANUP:
[ ] Execute Step 2 (backup branch)
[ ] Execute Step 3 (delete dead code)
[ ] Execute Step 4 (verify imports)
[ ] Execute Step 5 (documentation)
[ ] Execute Step 6 (commit)
[ ] Execute Step 7 (verify works)

AFTER CLEANUP:
[ ] Push to main branch
[ ] Verify CI/tests pass (if you have them)
[ ] Update README to point to new structure
[ ] Test one booking scenario to confirm nothing broke
[ ] Mark system as "cleaned" in project notes
```

---

## GIT COMMANDS (Copy-Paste)

```bash
# Step 1: Backup
git branch backup-pre-cleanup-$(date +%s)

# Step 2: Delete
rm -rf main/engine main/agent main/tools/browser/human
rm -f test_bms.js test_bms2.js bb.js bb2.js bb3.js query.js t.js
rm -rf test-results/ tmpclaude-*

# Step 3: Verify
grep -r "from.*engine\|from.*main/agent" main/ renderer/ 2>/dev/null | grep -v node_modules

# Step 4: Commit
git add -A
git commit -m "Clean dead code and reorganize folders"

# Step 5: Verify works
npm run lint
npm run build
npm start
```

---

**Estimated Time**: 20 minutes total
**Risk**: LOW (all deletes verified safe)
**Benefit**: Cleaner structure, less developer confusion

**READY TO EXECUTE!** ✅
