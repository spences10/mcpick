import type { PortableMcpServer } from '../types.js';
import type {
	RegistryPackage,
	RegistryServer,
} from './registry-api.js';

export interface RegistryInstall {
	server: PortableMcpServer;
	required_env: string[];
	secret_env: string[];
}

function literal_runtime_arguments(pkg: RegistryPackage): string[] {
	return (pkg.runtimeArguments ?? []).flatMap((argument) => {
		if (argument.isRequired && typeof argument.value !== 'string') {
			throw new Error(
				`Registry package '${pkg.identifier}' requires runtime argument '${argument.name ?? 'positional argument'}', which mcpick cannot resolve automatically.`,
			);
		}
		if (typeof argument.value !== 'string') return [];
		if (argument.type === 'named' && argument.name) {
			return [`${argument.name}=${argument.value}`];
		}
		return [argument.value];
	});
}

export function registry_install_config(
	entry: RegistryServer,
): RegistryInstall {
	const pkg = entry.packages.find(
		(candidate) =>
			candidate.registryType === 'npm' &&
			(candidate.transport?.type ?? 'stdio') === 'stdio',
	);
	if (!pkg) {
		throw new Error(
			`Registry server '${entry.name}' has no supported npm stdio package.`,
		);
	}
	if (!pkg.version) {
		throw new Error(
			`Registry package '${pkg.identifier}' has no exact version.`,
		);
	}

	const environment = pkg.environmentVariables ?? [];
	const env = Object.fromEntries(
		environment.flatMap((variable) =>
			typeof variable.default === 'string'
				? [[variable.name, variable.default]]
				: [],
		),
	);
	const package_spec = `${pkg.identifier}@${pkg.version}`;
	const command = pkg.runtimeHint ?? 'npx';
	const runtime_args = literal_runtime_arguments(pkg);
	const yes_args =
		command === 'npx' && !runtime_args.includes('-y') ? ['-y'] : [];
	return {
		server: {
			name: entry.name,
			transport: 'stdio',
			command,
			args: [...runtime_args, ...yes_args, package_spec],
			...(Object.keys(env).length > 0 ? { env } : {}),
			...(entry.description
				? { description: entry.description }
				: {}),
		},
		required_env: environment
			.filter((variable) => variable.isRequired)
			.map((variable) => variable.name),
		secret_env: environment
			.filter((variable) => variable.isSecret)
			.map((variable) => variable.name),
	};
}
