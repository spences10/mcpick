import { describe, expect, it } from 'vitest';
import type { RegistryServer } from './registry-api.js';
import { registry_install_config } from './registry-install.js';

function entry(
	overrides: Partial<RegistryServer> = {},
): RegistryServer {
	return {
		name: 'io.example/server',
		description: 'Example server',
		packages: [
			{
				registryType: 'npm',
				identifier: '@example/server',
				version: '2.3.4',
				runtimeHint: 'npx',
				transport: { type: 'stdio' },
				runtimeArguments: [
					{ type: 'positional', value: '--verbose' },
				],
				environmentVariables: [
					{
						name: 'API_TOKEN',
						isRequired: true,
						isSecret: true,
					},
					{ name: 'REGION', default: 'eu-west-1' },
				],
			},
		],
		...overrides,
	};
}

describe('registry_install_config', () => {
	it('maps an npm stdio package to a pinned portable config', () => {
		const install = registry_install_config(entry());

		expect(install).toEqual({
			server: {
				name: 'io.example/server',
				transport: 'stdio',
				command: 'npx',
				args: ['--verbose', '-y', '@example/server@2.3.4'],
				env: { REGION: 'eu-west-1' },
				description: 'Example server',
			},
			required_env: ['API_TOKEN'],
			secret_env: ['API_TOKEN'],
		});
	});

	it('rejects required runtime inputs it cannot resolve', () => {
		const server = entry();
		server.packages[0].runtimeArguments = [
			{ type: 'named', name: '--config', isRequired: true },
		];
		expect(() => registry_install_config(server)).toThrow(
			"requires runtime argument '--config'",
		);
	});

	it('rejects unsupported packages instead of guessing', () => {
		expect(() =>
			registry_install_config(
				entry({
					packages: [
						{
							registryType: 'oci',
							identifier: 'example/server',
							version: '1.0.0',
							transport: { type: 'stdio' },
						},
					],
				}),
			),
		).toThrow('no supported npm stdio package');
	});

	it('rejects unpinned registry packages', () => {
		const server = entry();
		server.packages[0].version = undefined;
		expect(() => registry_install_config(server)).toThrow(
			'has no exact version',
		);
	});
});
