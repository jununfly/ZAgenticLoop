/**
 * Loop Sync - Detect and sync drift between Loop configuration files
 *
 * This module detects:
 * 1. zj-loop/STATE.md ↔ zj-loop/ZJ-LOOP.md consistency
 * 2. Skills version updates
 * 3. Missing required files
 * 4. Configuration drift from starters
 */
import { collectProjectEvidenceFacts, createNodeProjectFileSystem, hasAnyProjectPath, DEFAULT_SKILL_DIRS, } from '@jununfly/zj-loop-core';
const ROUTE_TABLE_FILE = 'zj-loop/zj-loop-route-table.yaml';
/**
 * Extract frontmatter from markdown files
 */
function extractFrontmatter(content) {
    const frontmatter = {};
    let body = content;
    if (content.startsWith('---')) {
        const endIndex = content.indexOf('---', 3);
        if (endIndex !== -1) {
            const fmContent = content.slice(3, endIndex);
            body = content.slice(endIndex + 3);
            for (const line of fmContent.split('\n')) {
                const colonIndex = line.indexOf(':');
                if (colonIndex !== -1) {
                    const key = line.slice(0, colonIndex).trim();
                    const value = line.slice(colonIndex + 1).trim();
                    frontmatter[key] = value;
                }
            }
        }
    }
    return { frontmatter, body };
}
/**
 * Extract patterns from ZJ-LOOP.md
 */
function extractLoopPatterns(loopContent) {
    const patterns = [];
    // Look for pattern references
    const patternRegex = /pattern[s]?[\s]*[:=][\s]*([\w\-]+)/gi;
    let match;
    while ((match = patternRegex.exec(loopContent)) !== null) {
        patterns.push(match[1]);
    }
    return patterns;
}
/**
 * Extract state file references from ZJ-LOOP.md
 */
function extractStateFiles(loopContent) {
    const stateFiles = [];
    // Look for canonical state file paths anywhere in the loop config.
    // ZJ-LOOP.md commonly uses bullets like "- State: zj-loop/STATE.md",
    // while registry-backed patterns use paths such as
    // "zj-loop/issue-triage-state.md".
    const stateRegex = /\b((?:zj-loop\/)?[\w-]*state[\w-]*\.md)\b/gi;
    let match;
    while ((match = stateRegex.exec(loopContent)) !== null) {
        stateFiles.push(match[1]);
    }
    return stateFiles;
}
/**
 * Compare two markdown files for consistency
 */
function compareMarkdownFiles(file1Content, file2Content, threshold = 0.5) {
    const differences = [];
    // Extract headings from both files
    const headings1 = file1Content.match(/^## .+$/gm) || [];
    const headings2 = file2Content.match(/^## .+$/gm) || [];
    // Check heading consistency
    const headingSet1 = new Set(headings1.map(h => h.toLowerCase()));
    const headingSet2 = new Set(headings2.map(h => h.toLowerCase()));
    const allHeadings = new Set([...headingSet1, ...headingSet2]);
    let matchingHeadings = 0;
    for (const heading of allHeadings) {
        if (headingSet1.has(heading) && headingSet2.has(heading)) {
            matchingHeadings++;
        }
        else if (!headingSet1.has(heading)) {
            differences.push(`Missing heading in file 1: ${heading}`);
        }
        else {
            differences.push(`Missing heading in file 2: ${heading}`);
        }
    }
    const similarity = allHeadings.size === 0 ? 1 : matchingHeadings / allHeadings.size;
    return { similarity, differences };
}
/**
 * Scan skills directory for version information
 */
async function scanSkillsDirectory(fs) {
    const skillsVersions = new Map();
    for (const skillsDir of ['.grok/skills', '.claude/skills', '.codex/skills', 'skills']) {
        const entries = await fs.listEntries(skillsDir);
        for (const entry of entries) {
            if (entry.kind !== 'directory')
                continue;
            const content = await fs.readTextIfExists(`${skillsDir}/${entry.name}/SKILL.md`);
            if (content) {
                const { frontmatter } = extractFrontmatter(content);
                skillsVersions.set(entry.name, frontmatter.version || 'unknown');
            }
        }
    }
    return skillsVersions;
}
/**
 * Main sync function
 */
export async function runSync(options) {
    const { targetDir, autoFix, dryRun, verbose } = options;
    const fs = createNodeProjectFileSystem(targetDir);
    const evidence = await collectProjectEvidenceFacts(fs);
    const issues = [];
    const suggestions = [];
    // Check for missing required files
    for (const file of evidence.missingRequiredLoopFiles) {
        issues.push({
            type: 'missing',
            file,
            message: `${file} is missing`,
            severity: 'error',
            suggestion: `Run 'npx @jununfly/zj-loop-init . --pattern daily-triage' to scaffold required files`,
        });
    }
    if (!(await fs.exists(ROUTE_TABLE_FILE))) {
        issues.push({
            type: 'missing',
            file: ROUTE_TABLE_FILE,
            message: `${ROUTE_TABLE_FILE} is missing; route dispatch control plane is not configured`,
            severity: 'info',
            suggestion: `Run 'npx @jununfly/zj-loop-init . --add route-table' to scaffold the route table`,
        });
    }
    const primaryStatePath = evidence.statePaths.find((p) => p === 'zj-loop/STATE.md') ?? evidence.statePaths[0];
    const loopConfigPath = 'zj-loop/ZJ-LOOP.md';
    // Check state ↔ ZJ-LOOP.md consistency
    if (primaryStatePath && evidence.loopConfig.present) {
        const stateContent = await fs.readTextIfExists(primaryStatePath);
        const loopContent = evidence.loopConfig.content;
        if (stateContent && loopContent) {
            // Extract patterns from ZJ-LOOP.md
            const patterns = extractLoopPatterns(loopContent);
            // Extract state files from ZJ-LOOP.md
            const stateFiles = extractStateFiles(loopContent);
            // Check if the state file is referenced in ZJ-LOOP.md
            if (!stateFiles.includes(primaryStatePath) && !stateFiles.includes(pathBasename(primaryStatePath))) {
                issues.push({
                    type: 'inconsistent',
                    file: loopConfigPath,
                    message: `${loopConfigPath} does not reference ${primaryStatePath}`,
                    severity: 'warning',
                    suggestion: `Add ${primaryStatePath} to the state files list in ${loopConfigPath}`,
                });
            }
            // Do not compare heading similarity between state and config files.
            // They intentionally carry different structures: STATE.md is operational
            // memory, while ZJ-LOOP.md is the loop contract.
        }
    }
    // Scan skills for version information
    const skillsVersions = await scanSkillsDirectory(fs);
    if (skillsVersions.size === 0 && await hasAnyProjectPath(fs, DEFAULT_SKILL_DIRS)) {
        suggestions.push('No skills found. Run zj-loop-init to scaffold skills.');
    }
    // Calculate score
    let score = 100;
    for (const issue of issues) {
        if (issue.severity === 'error') {
            score -= 20;
        }
        else if (issue.severity === 'warning') {
            score -= 10;
        }
        else {
            score -= 1;
        }
    }
    score = Math.max(0, Math.min(100, score));
    // Determine level
    let level = 'healthy';
    if (score < 40) {
        level = 'critical';
    }
    else if (score < 70) {
        level = 'warning';
    }
    // Add suggestions based on issues
    if (issues.some(i => i.type === 'missing')) {
        suggestions.push('Run zj-loop-init to scaffold missing files');
    }
    if (issues.some(i => i.type === 'inconsistent')) {
        suggestions.push('Review state and ZJ-LOOP.md for consistency');
    }
    return {
        score,
        level,
        issues,
        suggestions,
        timestamp: new Date().toISOString(),
    };
}
function pathBasename(projectPath) {
    const parts = projectPath.split('/');
    return parts[parts.length - 1] ?? projectPath;
}
/**
 * Format report for CLI output
 */
export function formatReport(report) {
    const lines = [];
    lines.push('');
    lines.push('Loop Sync Report');
    lines.push('══════════════════════════════════════════════════');
    lines.push(`Score: ${report.score}/100 (${report.level})`);
    lines.push('');
    if (report.issues.length === 0) {
        lines.push('✅ No issues detected. Configuration is consistent.');
    }
    else {
        lines.push(`Found ${report.issues.length} issue(s):`);
        lines.push('');
        const errors = report.issues.filter(i => i.severity === 'error');
        const warnings = report.issues.filter(i => i.severity === 'warning');
        const infos = report.issues.filter(i => i.severity === 'info');
        if (errors.length > 0) {
            lines.push('❌ Errors:');
            for (const issue of errors) {
                lines.push(`   - ${issue.file}: ${issue.message}`);
            }
            lines.push('');
        }
        if (warnings.length > 0) {
            lines.push('⚠️ Warnings:');
            for (const issue of warnings) {
                lines.push(`   - ${issue.file}: ${issue.message}`);
            }
            lines.push('');
        }
        if (infos.length > 0) {
            lines.push('ℹ️ Information:');
            for (const issue of infos) {
                lines.push(`   - ${issue.file}: ${issue.message}`);
            }
            lines.push('');
        }
    }
    if (report.suggestions.length > 0) {
        lines.push('💡 Suggestions:');
        for (const suggestion of report.suggestions) {
            lines.push(`   - ${suggestion}`);
        }
    }
    return lines.join('\n');
}
