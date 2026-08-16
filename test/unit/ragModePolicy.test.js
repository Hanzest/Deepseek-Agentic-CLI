import { describe, it, expect } from 'vitest';
import { modeGatePolicy, MUTATION_BLOCKED_TOOLS } from '../../lib/policyEngine.js';

// RAG search is a read-only tool: it must be usable in BOTH Plan Mode and
// Agent Mode. modeGatePolicy blocks only mutation/execution tools in Plan Mode,
// so rag_search must (a) not be listed as a mutation tool and (b) pass the gate
// in both modes.
describe('rag_search mode policy', () => {
  it('rag_search is NOT in MUTATION_BLOCKED_TOOLS (read-only)', () => {
    expect(MUTATION_BLOCKED_TOOLS.has('rag_search')).toBe(false);
  });

  it('modeGatePolicy allows rag_search in Agent Mode', () => {
    const result = modeGatePolicy({ toolName: 'rag_search', args: {}, agentMode: 'agent' });
    expect(result.allow).toBe(true);
  });

  it('modeGatePolicy allows rag_search in Plan Mode', () => {
    const result = modeGatePolicy({ toolName: 'rag_search', args: {}, agentMode: 'plan' });
    expect(result.allow).toBe(true);
  });

  it('mutation tools remain blocked in Plan Mode (sanity check)', () => {
    const result = modeGatePolicy({ toolName: 'patch_file', args: { file_path: '/tmp/x.md' }, agentMode: 'plan' });
    expect(result.allow).toBe(false);
  });
});
