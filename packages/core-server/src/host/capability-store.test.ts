import { describe, expect, it } from 'vitest';
import { fakeModule } from '../testing';
import { CapabilityStore } from './capability-store';

const multi = (name: string) => ({ name, multi: true });

/** A store in which `provider` has provided `name`. */
function provided(name: string, implementation: unknown = 'impl') {
  const store = new CapabilityStore();
  const provider = fakeModule('provider', { provides: [name] });
  store.setRegistering('provider');
  store.accessFor(provider).provide(name, implementation);
  store.setRegistering(null);
  return { store, provider };
}

describe('CapabilityStore', () => {
  it('hands what a module provided to a module that requires it', () => {
    const { store } = provided('x@1');

    expect(store.accessFor(fakeModule('user', { requires: ['x@1'] })).get('x@1')).toBe('impl');
  });

  it('knows what a module provided, and lets the core look a capability up', () => {
    const { store } = provided('x@1', 'the implementation');

    expect(store.providedBy('provider')).toEqual(['x@1']);
    expect(store.providedBy('other')).toEqual([]);
    expect(store.find('x@1')).toBe('the implementation');
    expect(store.find('nothing@1')).toBeUndefined();
  });

  it('only lets a module provide what it declared', () => {
    const store = new CapabilityStore();
    store.setRegistering('a');

    expect(() => store.accessFor(fakeModule('a')).provide('x@1', 1)).toThrow('does not declare it');
  });

  it('only lets a module provide while it registers', () => {
    const store = new CapabilityStore();

    expect(() => store.accessFor(fakeModule('a', { provides: ['x@1'] })).provide('x@1', 1)).toThrow(
      'can only provide capabilities while it registers',
    );
    store.setRegistering('someone-else');
    expect(() => store.accessFor(fakeModule('a', { provides: ['x@1'] })).provide('x@1', 1)).toThrow(
      'can only provide',
    );
  });

  it('does not let a module provide the same capability twice', () => {
    const store = new CapabilityStore();
    const access = store.accessFor(fakeModule('a', { provides: ['x@1'] }));
    store.setRegistering('a');
    access.provide('x@1', 1);

    expect(() => access.provide('x@1', 2)).toThrow('already provided "x@1"');
  });

  it('only lets get() ask for what is listed in requires', () => {
    const { store } = provided('x@1');

    expect(() => store.accessFor(fakeModule('user')).get('x@1')).toThrow(
      'does not list it in "requires"',
    );
    expect(() => store.accessFor(fakeModule('user', { optional: ['x@1'] })).get('x@1')).toThrow(
      'does not list it in "requires"',
    );
  });

  it('says so when nothing provided a required capability', () => {
    expect(() =>
      new CapabilityStore().accessFor(fakeModule('user', { requires: ['x@1'] })).get('x@1'),
    ).toThrow('nothing provided "x@1"');
  });

  it('lets tryGet() ask for required and optional capabilities, and gives undefined when there is none', () => {
    const { store } = provided('x@1');

    expect(store.accessFor(fakeModule('user', { requires: ['x@1'] })).tryGet('x@1')).toBe('impl');
    expect(store.accessFor(fakeModule('user', { optional: ['x@1'] })).tryGet('x@1')).toBe('impl');
    expect(
      store.accessFor(fakeModule('user', { optional: ['y@1'] })).tryGet('y@1'),
    ).toBeUndefined();
    expect(() => store.accessFor(fakeModule('user')).tryGet('x@1')).toThrow(
      'does not list it in "requires" or "optional"',
    );
  });

  it('collects the providers of a multi capability with getAll(), and points to it when get() or tryGet() meets several', () => {
    const store = new CapabilityStore();
    for (const id of ['printer', 'display']) {
      store.setRegistering(id);
      store.accessFor(fakeModule(id, { provides: [multi('o@1')] })).provide('o@1', id);
    }
    store.setRegistering(null);
    const user = store.accessFor(fakeModule('user', { requires: ['o@1'] }));

    expect(user.getAll('o@1')).toEqual(['printer', 'display']);
    expect(() => user.get('o@1')).toThrow('use getAll()');
    expect(() => user.tryGet('o@1')).toThrow('use getAll()');
  });

  it('gives an empty list from getAll() when nothing was provided, and refuses undeclared capabilities', () => {
    const store = new CapabilityStore();

    expect(store.accessFor(fakeModule('user', { optional: ['o@1'] })).getAll('o@1')).toEqual([]);
    expect(() => store.accessFor(fakeModule('user')).getAll('o@1')).toThrow('does not list it');
  });
});
