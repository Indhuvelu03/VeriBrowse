// ⚠️ DEPRECATED — safe to delete.
// This module is orphaned: nothing imports it. Its functionality is fully
// covered by aiService.callLLMForAction() which is used by browserAgentLoop.
// Kept only to avoid breaking any dynamic require() we haven't found yet.

// ExecutionPlanner.js
// Decides next micro action based on goal, perception, memory, lastResult

import { callLLMForAction } from '../services/aiService.js';
import { SYSTEM_PROMPT } from '../constants.js';

export default async function decide({ goal, perception, memory, lastResult }) {
  // Compose LLM input
  const input = {
    goal,
    perception,
    memory,
    lastResult
  };
  // SYSTEM_PROMPT should instruct LLM to return ONE micro action
  const action = await callLLMForAction(input);
  // Validate action schema here if needed
  return action;
}
