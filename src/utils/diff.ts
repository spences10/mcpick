/**
 * Minimal unified diff (LCS-based, 3 lines of context by default).
 * Config files are small, so the O(n*m) DP is fine and keeps us
 * dependency-free.
 */

type DiffOp =
	| { type: 'context'; line: string; old_no: number; new_no: number }
	| { type: 'remove'; line: string; old_no: number }
	| { type: 'add'; line: string; new_no: number };

function compute_ops(
	old_lines: string[],
	new_lines: string[],
): DiffOp[] {
	const m = old_lines.length;
	const n = new_lines.length;

	// table[i][j] = LCS length of old_lines[i..] and new_lines[j..]
	const table: number[][] = Array.from({ length: m + 1 }, () =>
		Array.from({ length: n + 1 }, () => 0),
	);
	for (let i = m - 1; i >= 0; i--) {
		for (let j = n - 1; j >= 0; j--) {
			table[i][j] =
				old_lines[i] === new_lines[j]
					? table[i + 1][j + 1] + 1
					: Math.max(table[i + 1][j], table[i][j + 1]);
		}
	}

	const ops: DiffOp[] = [];
	let i = 0;
	let j = 0;
	while (i < m && j < n) {
		if (old_lines[i] === new_lines[j]) {
			ops.push({
				type: 'context',
				line: old_lines[i],
				old_no: i + 1,
				new_no: j + 1,
			});
			i++;
			j++;
		} else if (table[i + 1][j] >= table[i][j + 1]) {
			ops.push({ type: 'remove', line: old_lines[i], old_no: i + 1 });
			i++;
		} else {
			ops.push({ type: 'add', line: new_lines[j], new_no: j + 1 });
			j++;
		}
	}
	while (i < m) {
		ops.push({ type: 'remove', line: old_lines[i], old_no: i + 1 });
		i++;
	}
	while (j < n) {
		ops.push({ type: 'add', line: new_lines[j], new_no: j + 1 });
		j++;
	}
	return ops;
}

interface Hunk {
	ops: DiffOp[];
	old_start: number;
	old_count: number;
	new_start: number;
	new_count: number;
}

function build_hunks(ops: DiffOp[], context: number): Hunk[] {
	const change_indices = ops.flatMap((op, index) =>
		op.type === 'context' ? [] : [index],
	);
	if (change_indices.length === 0) return [];

	// Expand each change by `context` ops on both sides, then merge overlaps.
	const ranges: Array<[number, number]> = [];
	for (const index of change_indices) {
		const start = Math.max(0, index - context);
		const end = Math.min(ops.length - 1, index + context);
		const last = ranges[ranges.length - 1];
		if (last && start <= last[1] + 1) {
			last[1] = Math.max(last[1], end);
		} else {
			ranges.push([start, end]);
		}
	}

	return ranges.map(([start, end]) => {
		const hunk_ops = ops.slice(start, end + 1);
		const old_numbers = hunk_ops.flatMap((op) =>
			op.type === 'add' ? [] : [op.old_no],
		);
		const new_numbers = hunk_ops.flatMap((op) =>
			op.type === 'remove' ? [] : [op.new_no],
		);
		return {
			ops: hunk_ops,
			old_start: old_numbers[0] ?? 0,
			old_count: old_numbers.length,
			new_start: new_numbers[0] ?? 0,
			new_count: new_numbers.length,
		};
	});
}

/**
 * Produce a unified diff between two file contents. When `old_content` is
 * undefined the file is treated as new (`--- /dev/null`, all lines added).
 * Returns an empty string when the contents are identical.
 */
export function unified_diff(
	old_content: string | undefined,
	next_content: string,
	path: string,
	context = 3,
): string {
	if (old_content === next_content) return '';

	const label = path.replace(/^\/+/, '');
	const old_lines =
		old_content === undefined ? [] : old_content.split('\n');
	const next_lines = next_content.split('\n');
	const ops = compute_ops(old_lines, next_lines);
	const hunks = build_hunks(ops, context);

	const old_label =
		old_content === undefined ? '/dev/null' : `a/${label}`;
	const lines = [`--- ${old_label}`, `+++ b/${label}`];
	for (const hunk of hunks) {
		lines.push(
			`@@ -${hunk.old_start},${hunk.old_count} +${hunk.new_start},${hunk.new_count} @@`,
		);
		for (const op of hunk.ops) {
			const marker =
				op.type === 'context'
					? ' '
					: op.type === 'remove'
						? '-'
						: '+';
			lines.push(`${marker}${op.line}`);
		}
	}
	return lines.join('\n');
}
