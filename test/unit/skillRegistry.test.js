import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanSkillDomains, buildSkillListBlock } from '../../lib/skillRegistry.js';

let tmpRoot;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('scanSkillDomains', () => {
  it('returns sorted domain names for dirs containing SKILL.md', () => {
    fs.mkdirSync(path.join(tmpRoot, 'api-design'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'api-design', 'SKILL.md'), '# API');
    fs.mkdirSync(path.join(tmpRoot, 'database'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'database', 'SKILL.md'), '# DB');
    fs.mkdirSync(path.join(tmpRoot, 'docker'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'docker', 'SKILL.md'), '# Docker');

    expect(scanSkillDomains(tmpRoot)).toEqual(['api-design', 'database', 'docker']);
  });

  it('skips dirs without a SKILL.md and ignores loose files', () => {
    fs.mkdirSync(path.join(tmpRoot, 'real-skill'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'real-skill', 'SKILL.md'), '# Real');
    fs.mkdirSync(path.join(tmpRoot, 'no-skill-here'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'loose.md'), '# Loose');

    expect(scanSkillDomains(tmpRoot)).toEqual(['real-skill']);
  });

  it('returns [] when the skills root is missing', () => {
    expect(scanSkillDomains(path.join(tmpRoot, 'nope'))).toEqual([]);
  });
});

describe('buildSkillListBlock', () => {
  it('joins domains into a comma-separated block', () => {
    fs.mkdirSync(path.join(tmpRoot, 'uiux'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'uiux', 'SKILL.md'), '# UI/UX');
    fs.mkdirSync(path.join(tmpRoot, 'security'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'security', 'SKILL.md'), '# Sec');

    expect(buildSkillListBlock(tmpRoot)).toBe('security, uiux');
  });

  it('returns a placeholder when no skills are registered', () => {
    expect(buildSkillListBlock(tmpRoot)).toBe('(no skills registered)');
    expect(buildSkillListBlock(path.join(tmpRoot, 'missing'))).toBe('(no skills registered)');
  });
});
