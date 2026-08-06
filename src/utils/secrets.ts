/**
 * Write-path secret detection and env-resolution helpers.
 *
 * Goal: stop secrets flowing through LLM conversation context into
 * config files, and nudge toward pinned server versions.
 *
 * Detection functions return pattern NAMES only — matched values must
 * never appear in warnings, errors, or logs.
 */

export interface ConfigWarning {
	key: string;
	pattern: string;
	remediation: string;
}

const VALUE_PATTERNS: Array<[string, RegExp]> = [
	['github-personal-access-token', /\bghp_[A-Za-z0-9]{20,}\b/],
	['github-fine-grained-token', /\bgithub_pat_[A-Za-z0-9_]{20,}\b/],
	['gitlab-personal-access-token', /\bglpat-[A-Za-z0-9_-]{10,}\b/],
	['api-key-sk', /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{8,}\b/],
	['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{8,}\b/],
	['aws-access-key-id', /\bAKIA[0-9A-Z]{16}\b/],
	[
		'jwt',
		/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/,
	],
	[
		'private-key',
		/-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
	],
];

const SENSITIVE_KEY_NAME = /(TOKEN|SECRET|PASSWORD|API[-_]?KEY)/i;

const PLACEHOLDER_PATTERNS: RegExp[] = [
	/^\$\{.+\}$/, // ${VAR} reference
	/^<.+>$/, // <your-token>
	/^x+$/i,
	/^(changeme|change-me|placeholder|example|dummy|test|todo|none)$/i,
	/^(your[-_ ]?)/i, // your-token-here
];

function is_placeholder(value: string): boolean {
	const trimmed = value.trim();
	if (trimmed.length < 4) return true;
	return PLACEHOLDER_PATTERNS.some((pattern) =>
		pattern.test(trimmed),
	);
}

/**
 * Detect known secret patterns in a single value.
 * Returns pattern names only, never the value or any substring of it.
 */
export function detect_secret_patterns(value: string): string[] {
	const matches: string[] = [];
	for (const [name, pattern] of VALUE_PATTERNS) {
		if (pattern.test(value)) matches.push(name);
	}
	return matches;
}

/**
 * Scan env/header values for secrets. Applies value patterns and a
 * generic check: keys whose name contains TOKEN/SECRET/PASSWORD/API_KEY
 * with a non-placeholder value.
 */
export function scan_secret_values(
	values: Record<string, string>,
): ConfigWarning[] {
	const warnings: ConfigWarning[] = [];
	for (const [key, value] of Object.entries(values)) {
		const patterns = detect_secret_patterns(value);
		// Generic key-name check only when no specific pattern matched,
		// to avoid duplicate warnings for the same value.
		if (
			patterns.length === 0 &&
			SENSITIVE_KEY_NAME.test(key) &&
			!is_placeholder(value)
		) {
			patterns.push('sensitive-key-value');
		}
		for (const pattern of patterns) {
			warnings.push({
				key,
				pattern,
				remediation:
					`Value for '${key}' looks like a secret and will be written to the config file in plaintext. ` +
					`Prefer a \${VAR} reference where the client supports it, or use --from-env ${key} ` +
					`so the value travels via the process environment instead of the command line.`,
			});
		}
	}
	return warnings;
}

/**
 * Resolve values for --from-env keys from the process environment.
 * Throws (naming only the key) if any key is unset or empty, so
 * callers can fail before any write. Resolved values are never
 * included in error messages.
 */
export function resolve_from_env(
	keys: string[],
	env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
	const resolved: Record<string, string> = {};
	for (const key of keys) {
		const value = env[key];
		if (value === undefined || value === '') {
			throw new Error(
				`--from-env: environment variable '${key}' is not set or is empty. ` +
					`Export it first (e.g. via 'nopeek run .env --only ${key} -- ...') and retry.`,
			);
		}
		resolved[key] = value;
	}
	return resolved;
}

function has_version(spec: string): boolean {
	// Scoped packages start with '@'; a version is an '@' after position 0.
	const at = spec.indexOf('@', 1);
	return at > 0;
}

function package_name(spec: string): string {
	const at = spec.indexOf('@', 1);
	return at > 0 ? spec.substring(0, at) : spec;
}

/**
 * Detect unpinned package execution in server args (e.g. npx -y pkg
 * with no version, or pkg@latest). Returns a warning for the first
 * offending package, or undefined if all looks pinned.
 */
export function detect_unpinned_package(
	args: string[],
): ConfigWarning | undefined {
	for (let i = 0; i < args.length; i++) {
		const token = args[i];
		if (token.endsWith('@latest')) {
			const pkg = package_name(token);
			return {
				key: pkg,
				pattern: 'latest-tag',
				remediation: `'${token}' pulls the latest release on every run. Pin an exact version instead: ${pkg}@x.y.z.`,
			};
		}
		if (token === '-y' || token === '--yes') {
			const next = args[i + 1];
			if (next && !next.startsWith('-') && !has_version(next)) {
				return {
					key: next,
					pattern: 'unpinned-version',
					remediation: `'${next}' is executed without a version pin. Pin an exact version instead: ${next}@x.y.z.`,
				};
			}
		}
	}
	return undefined;
}

/**
 * Collect all write-time warnings for a server config: secret values
 * in env/headers plus the version-pinning nudge. One channel, shared
 * by add and add-json for both stderr and --json output.
 */
export function collect_config_warnings(input: {
	env?: Record<string, string>;
	headers?: Record<string, string>;
	args?: string[];
}): ConfigWarning[] {
	const warnings: ConfigWarning[] = [];
	if (input.env) warnings.push(...scan_secret_values(input.env));
	if (input.headers)
		warnings.push(...scan_secret_values(input.headers));
	if (input.args) {
		const pinning = detect_unpinned_package(input.args);
		if (pinning) warnings.push(pinning);
	}
	return warnings;
}

/**
 * Print warnings to stderr. Non-blocking, and never suppressed by
 * --yes: the user (or agent) should always see them.
 */
export function emit_warnings(warnings: ConfigWarning[]): void {
	for (const warning of warnings) {
		console.error(
			`warning: [${warning.pattern}] ${warning.key}: ${warning.remediation}`,
		);
	}
}
