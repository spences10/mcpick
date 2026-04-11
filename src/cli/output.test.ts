import { describe, expect, it, vi } from 'vitest';
import { output } from './output.js';

describe('output', () => {
	it('outputs JSON when json flag is true', () => {
		const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
		output({ foo: 'bar' }, true);
		expect(spy).toHaveBeenCalledWith(
			JSON.stringify({ foo: 'bar' }, null, 2),
		);
		spy.mockRestore();
	});

	it('outputs string directly when json is false', () => {
		const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
		output('hello world', false);
		expect(spy).toHaveBeenCalledWith('hello world');
		spy.mockRestore();
	});

	it('outputs array items individually when json is false', () => {
		const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
		output(['a', 'b', 'c'], false);
		expect(spy).toHaveBeenCalledTimes(3);
		expect(spy).toHaveBeenNthCalledWith(1, 'a');
		expect(spy).toHaveBeenNthCalledWith(2, 'b');
		expect(spy).toHaveBeenNthCalledWith(3, 'c');
		spy.mockRestore();
	});

	it('outputs array as JSON when json flag is true', () => {
		const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
		output(['a', 'b'], true);
		expect(spy).toHaveBeenCalledWith(
			JSON.stringify(['a', 'b'], null, 2),
		);
		spy.mockRestore();
	});
});
