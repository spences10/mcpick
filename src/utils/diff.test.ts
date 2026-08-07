import { describe, expect, it } from 'vitest';
import { unified_diff } from './diff.js';

describe('unified_diff', () => {
	it('returns empty string for identical content', () => {
		expect(unified_diff('a\nb\nc', 'a\nb\nc', 'f.json')).toBe('');
	});

	it('labels paths with a/ and b/ prefixes', () => {
		const diff = unified_diff('a\nb', 'a\nc', 'config.json');
		expect(diff).toContain('--- a/config.json');
		expect(diff).toContain('+++ b/config.json');
	});

	it('marks removed and added lines with - and +', () => {
		const diff = unified_diff('a\nb\nc', 'a\nx\nc', 'f');
		expect(diff).toContain('-b');
		expect(diff).toContain('+x');
		const lines = diff.split('\n');
		expect(lines).toContain(' a');
		expect(lines).toContain(' c');
	});

	it('emits a hunk header with correct line ranges', () => {
		const old_content = '1\n2\n3\n4\n5\n6\n7\n8\n9\n10';
		const next_content = old_content.replace('5', 'five');
		const diff = unified_diff(old_content, next_content, 'f');
		// change at line 5, 3 lines context → lines 2..8 (7 lines each side)
		expect(diff).toContain('@@ -2,7 +2,7 @@');
	});

	it('splits distant changes into separate hunks', () => {
		const old_content =
			'1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n16\n17\n18\n19\n20';
		const next_content = old_content
			.replace('2', 'two')
			.replace('19', 'nineteen');
		const diff = unified_diff(old_content, next_content, 'f');
		expect(diff.match(/@@/g)?.length).toBe(4); // two hunk headers (2 markers each)
	});

	it('merges nearby changes into one hunk', () => {
		const old_content = '1\n2\n3\n4\n5\n6\n7\n8';
		const next_content = old_content
			.replace('2', 'two')
			.replace('5', 'five');
		const diff = unified_diff(old_content, next_content, 'f');
		expect(diff.match(/@@/g)?.length).toBe(2); // single hunk
	});

	it('treats undefined old content as a new file from /dev/null', () => {
		const diff = unified_diff(undefined, 'a\nb', 'new.json');
		expect(diff).toContain('--- /dev/null');
		expect(diff).toContain('+++ b/new.json');
		expect(diff).toContain('+a');
		expect(diff).toContain('+b');
		expect(diff).not.toContain('-a');
	});

	it('handles pure additions at the end', () => {
		const diff = unified_diff('a\nb', 'a\nb\nc', 'f');
		expect(diff).toContain('+c');
		const body_lines = diff
			.split('\n')
			.filter((l) => !l.startsWith('---') && !l.startsWith('@@'));
		expect(body_lines.every((l) => !l.startsWith('-'))).toBe(true);
		const hunk = diff.split('\n').find((l) => l.startsWith('@@'));
		expect(hunk).toBe('@@ -1,2 +1,3 @@');
	});

	it('handles pure removals', () => {
		const diff = unified_diff('a\nb\nc', 'a', 'f');
		expect(diff).toContain('-b');
		expect(diff).toContain('-c');
	});

	it('produces parseable diffs for realistic JSON configs', () => {
		const old_content = JSON.stringify(
			{ mcpServers: { a: { command: 'a' }, b: { command: 'b' } } },
			null,
			2,
		);
		const next_content = JSON.stringify(
			{ mcpServers: { a: { command: 'a' } } },
			null,
			2,
		);
		const diff = unified_diff(old_content, next_content, 'mcp.json');
		expect(diff).toContain('--- a/mcp.json');
		expect(diff).toContain('+++ b/mcp.json');
		expect(diff).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@$/m);
		expect(diff.split('\n').some((l) => l === '-    "b": {')).toBe(
			true,
		);
	});
});
