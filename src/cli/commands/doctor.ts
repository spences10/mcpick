import { defineCommand } from 'citty';
import { get_client_adapter } from '../../core/client-config.js';
import { run_doctor } from '../../core/doctor.js';
import { error, output } from '../output.js';

export default defineCommand({
	meta: {
		name: 'doctor',
		description:
			'Validate known MCP client configs and report problems (read-only)',
	},
	args: {
		client: {
			type: 'string',
			description: 'Check only this client (e.g. claude-code)',
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		if (args.client && !get_client_adapter(args.client)) {
			error(
				`Unknown client '${args.client}'. Run \`mcpick clients --json\` for known client ids.`,
			);
		}

		const report = await run_doctor({ client: args.client });

		if (args.json) {
			output(report, true);
		} else {
			print_human_report(report);
		}

		if (report.summary.errors > 0) {
			process.exitCode = 1;
		}
	},
});

function print_human_report(
	report: Awaited<ReturnType<typeof run_doctor>>,
): void {
	if (report.issues.length === 0) {
		console.log(
			`✔ no problems found (${report.summary.checked} config file(s) checked)`,
		);
		return;
	}

	let current_client = '';
	for (const issue of report.issues) {
		if (issue.client !== current_client) {
			current_client = issue.client;
			console.log(`\n${current_client}`);
		}
		const marker = issue.severity === 'error' ? '✖' : '⚠';
		const server = issue.server ? ` server "${issue.server}"` : '';
		console.log(
			`  ${marker} [${issue.check}]${server} ${issue.path}`,
		);
		console.log(`    ${issue.message}`);
		if (issue.remediation) {
			console.log(`    fix: ${issue.remediation}`);
		}
	}

	console.log(
		`\n${report.summary.errors} error(s), ${report.summary.warnings} warning(s), ${report.summary.checked} config file(s) checked`,
	);
	for (const skipped of report.skipped_checks) {
		console.log(`  skipped: ${skipped}`);
	}
}
