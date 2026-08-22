/**
 * @fileoverview Skill registry — a lightweight, deterministic alternative to
 * RAG for skill detection.
 *
 * Skills are a SMALL, STABLE, KNOWN set (a handful of docs/skills/<domain>/SKILL.md
 * files), so fuzzy retrieval (embedding + BM25 + rerank) is redundant. Instead
 * we scan the directory once at startup and inject the plain domain-name list
 * into the system prompt. The agent matches the task domain by exact name and
 * reads the matching SKILL.md directly.
 *
 * @module lib/skillRegistry
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Scan a skills root directory and return the sorted list of skill domain
 * names (subdirectories that contain a SKILL.md).
 *
 * @param {string} skillsRoot - Absolute path to the skills directory.
 * @returns {string[]} Sorted domain names; empty array when the dir is missing.
 */
export function scanSkillDomains(skillsRoot) {
  try {
    const entries = fs.readdirSync(skillsRoot, { withFileTypes: true });
    const domains = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (fs.existsSync(path.join(skillsRoot, entry.name, 'SKILL.md'))) {
        domains.push(entry.name);
      }
    }
    return domains.sort();
  } catch {
    return [];
  }
}

/**
 * Build the compact, comma-separated skill-domain list block for prompt
 * injection. Returns a placeholder note when no skills are registered.
 *
 * @param {string} skillsRoot - Absolute path to the skills directory.
 * @returns {string} e.g. "api-design, database, docker" or "(no skills registered)".
 */
export function buildSkillListBlock(skillsRoot) {
  const domains = scanSkillDomains(skillsRoot);
  if (domains.length === 0) return '(no skills registered)';
  return domains.join(', ');
}

export default { scanSkillDomains, buildSkillListBlock };
