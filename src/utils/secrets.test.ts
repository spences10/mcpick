import { describe, expect, it } from 'vitest';
import {
	collect_config_warnings,
	detect_secret_patterns,
	detect_unpinned_package,
	resolve_from_env,
	scan_secret_values,
} from './secrets.js';

describe('detect_secret_patterns', () => {
	it('detects GitHub personal access tokens', () => {
		expect(
			detect_secret_patterns('ghp_abcdefghij0123456789abcd'),
		).toContain('github-personal-access-token');
	});

	it('detects GitHub fine-grained tokens', () => {
		expect(
			detect_secret_patterns(
				'github_pat_11ABCDEFG0abcdefghij_0123456789',
			),
		).toContain('github-fine-grained-token');
	});

	it('detects GitLab tokens', () => {
		expect(detect_secret_patterns('glpat-abcdefghij0123')).toContain(
			'gitlab-personal-access-token',
		);
	});

	it('detects sk- style API keys', () => {
		expect(
			detect_secret_patterns('sk-abcdefghij0123456789'),
		).toContain('api-key-sk');
	});

	it('detects Slack tokens', () => {
		expect(
			detect_secret_patterns('xoxb-1234567890-abcdefghij'),
		).toContain('slack-token');
	});

	it('detects AWS access key IDs', () => {
		expect(detect_secret_patterns('AKIAIOSFODNN7EXAMPLE')).toContain(
			'aws-access-key-id',
		);
	});

	it('detects JWTs', () => {
		expect(
			detect_secret_patterns(
				'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
			),
		).toContain('jwt');
	});

	it('detects PEM private key headers', () => {
		expect(
			detect_secret_patterns('-----BEGIN PRIVATE KEY-----\nMIIE...'),
		).toContain('private-key');
		expect(
			detect_secret_patterns(
				'-----BEGIN RSA PRIVATE KEY-----\nMIIE...',
			),
		).toContain('private-key');
	});

	it('does not flag ordinary values', () => {
		expect(detect_secret_patterns('hello world')).toEqual([]);
		expect(detect_secret_patterns('us-east-1')).toEqual([]);
	});
});

describe('scan_secret_values', () => {
	it('flags sensitive key names with real values', () => {
		const warnings = scan_secret_values({
			GITHUB_TOKEN: 'some-real-token-value-123',
		});
		expect(warnings).toHaveLength(1);
		expect(warnings[0].key).toBe('GITHUB_TOKEN');
		expect(warnings[0].pattern).toBe('sensitive-key-value');
		expect(warnings[0].remediation).toContain('--from-env');
	});

	it('never includes the secret value in warnings', () => {
		const secret = 'ghp_abcdefghij0123456789abcd';
		const warnings = scan_secret_values({ GITHUB_TOKEN: secret });
		expect(warnings.length).toBeGreaterThan(0);
		for (const warning of warnings) {
			expect(JSON.stringify(warning)).not.toContain(secret);
		}
	});

	it('ignores placeholder values for sensitive key names', () => {
		const placeholders = [
			'changeme',
			'${GITHUB_TOKEN}',
			'<your-token>',
			'your-api-key-here',
			'xxxx',
			'placeholder',
		];
		for (const value of placeholders) {
			expect(scan_secret_values({ API_KEY: value })).toEqual([]);
		}
	});

	it('matches hyphenated api-key names (x-api-key headers)', () => {
		const warnings = scan_secret_values({
			'x-api-key': 'supersecretvalue123',
		});
		expect(warnings).toHaveLength(1);
		expect(warnings[0].key).toBe('x-api-key');
		expect(warnings[0].pattern).toBe('sensitive-key-value');
	});

	it('ignores non-sensitive keys with ordinary values', () => {
		expect(scan_secret_values({ LOG_LEVEL: 'debug' })).toEqual([]);
	});
});

describe('resolve_from_env', () => {
	it('resolves values from the process environment', () => {
		const resolved = resolve_from_env(['A', 'B'], {
			A: '1',
			B: '2',
		});
		expect(resolved).toEqual({ A: '1', B: '2' });
	});

	it('fails naming the key when a variable is unset', () => {
		expect(() => resolve_from_env(['MISSING'], {})).toThrow(
			/--from-env: environment variable 'MISSING' is not set/,
		);
	});

	it('fails when a variable is empty', () => {
		expect(() => resolve_from_env(['EMPTY'], { EMPTY: '' })).toThrow(
			/--from-env: environment variable 'EMPTY'/,
		);
	});

	it('never includes resolved values in error messages', () => {
		try {
			resolve_from_env(['OK', 'MISSING'], { OK: 'super-secret' });
			expect.unreachable();
		} catch (err) {
			expect(err instanceof Error ? err.message : '').not.toContain(
				'super-secret',
			);
		}
	});
});

describe('detect_unpinned_package', () => {
	it('flags -y with an unpinned package', () => {
		const warning = detect_unpinned_package(['-y', 'some-mcp']);
		expect(warning?.pattern).toBe('unpinned-version');
		expect(warning?.key).toBe('some-mcp');
		expect(warning?.remediation).toContain('some-mcp@x.y.z');
	});

	it('flags @latest', () => {
		const warning = detect_unpinned_package([
			'-y',
			'some-mcp@latest',
		]);
		expect(warning?.pattern).toBe('latest-tag');
		expect(warning?.key).toBe('some-mcp');
	});

	it('flags unpinned scoped packages', () => {
		const warning = detect_unpinned_package([
			'-y',
			'@modelcontextprotocol/server-github',
		]);
		expect(warning?.pattern).toBe('unpinned-version');
		expect(warning?.key).toBe('@modelcontextprotocol/server-github');
	});

	it('accepts pinned packages', () => {
		expect(
			detect_unpinned_package(['-y', 'some-mcp@1.2.3']),
		).toBeUndefined();
		expect(
			detect_unpinned_package(['-y', '@scope/pkg@0.0.1']),
		).toBeUndefined();
	});

	it('ignores args without package execution', () => {
		expect(
			detect_unpinned_package(['--port', '8080']),
		).toBeUndefined();
	});
});

describe('collect_config_warnings', () => {
	it('combines env, headers, and pinning warnings', () => {
		const warnings = collect_config_warnings({
			env: { GITHUB_TOKEN: 'ghp_abcdefghij0123456789abcd' },
			headers: {
				Authorization: 'xoxb-1234567890-abcdefghij',
			},
			args: ['-y', 'some-mcp'],
		});
		expect(warnings.length).toBeGreaterThanOrEqual(3);
		const patterns = warnings.map((warning) => warning.pattern);
		expect(patterns).toContain('github-personal-access-token');
		expect(patterns).toContain('slack-token');
		expect(patterns).toContain('unpinned-version');
	});

	it('produces the JSON warnings shape {key, pattern, remediation}', () => {
		const warnings = collect_config_warnings({
			env: { API_KEY: 'a-real-api-key-value' },
		});
		for (const warning of warnings) {
			expect(Object.keys(warning).sort()).toEqual([
				'key',
				'pattern',
				'remediation',
			]);
		}
	});

	it('returns no warnings for clean configs', () => {
		expect(
			collect_config_warnings({
				env: { API_KEY: '${API_KEY}' },
				args: ['-y', 'some-mcp@1.2.3'],
			}),
		).toEqual([]);
	});
});
