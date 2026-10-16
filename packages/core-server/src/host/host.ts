import { CapabilityStore } from './capability-store';
import type { LoadedModule } from '../blueprint';
import { EventBus } from '../events';
import { HookRegistry } from '../hooks';
import {
  pendingRoutes,
  type ModuleContext,
  type RouteRegistry,
  type ServerModule,
} from '../module-api';
import { createLogger, type LogSink, type Logger } from '../common';
import { loadServerModule } from './load-module';
import type { ModuleRegistry } from '../registry';

export type Phase = 'load' | 'register' | 'migrate' | 'start' | 'stop';

/** A problem in one phase of the lifecycle. The message names the module. */
export class ModuleError extends Error {
  readonly phase: Phase;
  /** Undefined for problems that belong to no single module (the migrations). */
  readonly moduleId: string | undefined;

  constructor(phase: Phase, moduleId: string | undefined, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    let message: string;
    if (phase === 'load') message = `module "${moduleId}" could not be loaded: ${reason}`;
    else if (phase === 'migrate') message = `the migrations failed: ${reason}`;
    else message = `module "${moduleId}" failed in ${phase}(): ${reason}`;

    super(message, { cause });
    this.name = 'ModuleError';
    this.phase = phase;
    this.moduleId = moduleId;
  }
}

export interface HostOptions {
  /** Absolute path of the data directory. */
  dataDir: string;
  /** Runs after every module registered and before the first one starts (the storage migrations). */
  migrate?: () => void | Promise<void>;
  /** How the server part of a module is loaded. By default the entry file is imported. */
  load?: (module: LoadedModule) => Promise<ServerModule | null>;
  /** Default: a new event bus. */
  events?: EventBus;
  /** Default: a new hook registry. */
  hooks?: HookRegistry;
  routes?: RouteRegistry;
  /** How long a module may take to stop. Default 10000. */
  stopTimeoutMs?: number;
  /** Where log lines go. Default: the console. */
  sink?: LogSink;
}

interface Instance {
  loaded: LoadedModule;
  implementation: ServerModule;
  context: ModuleContext;
}

type State = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped';

/**
 * Brings the modules of a frozen registry to life and shuts them down again.
 *
 * Start: load every server part, `register()` in dependency order, run the migrations, `start()` in
 * dependency order. An error anywhere aborts the startup (the message names the module) and stops
 * the modules that already started. Stop: `stop()` in reverse start order.
 */
export class ModuleHost {
  private readonly registry: ModuleRegistry;
  private readonly options: HostOptions;
  private readonly sink: LogSink;
  private readonly log: Logger;
  /** The event bus all modules share. */
  readonly events: EventBus;
  /** The hook registry all modules share. */
  readonly hooks: HookRegistry;
  private readonly capabilities = new CapabilityStore();
  private readonly started: Instance[] = [];
  private state: State = 'idle';
  private startPromise: Promise<void> | null = null;
  private stopPromise: Promise<ModuleError[]> | null = null;

  constructor(registry: ModuleRegistry, options: HostOptions) {
    this.registry = registry;
    this.options = options;
    this.sink = options.sink ?? console;
    this.log = createLogger('mcrs', this.sink);
    this.events = options.events ?? new EventBus(this.log);
    this.hooks = options.hooks ?? new HookRegistry(this.log);
  }

  /** Loads, registers, migrates and starts all modules. Rejects with a ModuleError on a problem. */
  async start(): Promise<void> {
    if (this.state !== 'idle')
      throw new Error(`the modules cannot be started: the host is ${this.state}`);
    if (!this.registry.frozen)
      throw new Error('the modules cannot be started: the registry is not frozen');

    this.state = 'starting';
    this.startPromise = this.runStartup();
    await this.startPromise;
  }

  /** Stops the started modules in reverse order. Returns the errors; a failing module does not stop the others. */
  stop(): Promise<ModuleError[]> {
    this.stopPromise ??= this.runStop();
    return this.stopPromise;
  }

  private async runStartup(): Promise<void> {
    try {
      const instances = await this.loadAll();
      await this.registerAll(instances);
      await this.migrate();
      await this.startAll(instances);
      if (this.state === 'starting') this.state = 'running';
      this.log.info(`${instances.length} module(s) started`);
    } catch (error) {
      this.log.error(error instanceof Error ? error.message : String(error));
      await this.stopStarted();
      this.state = 'stopped';
      throw error;
    }
  }

  private async runStop(): Promise<ModuleError[]> {
    if (this.state === 'idle') {
      this.state = 'stopped';
      return [];
    }
    if (this.startPromise !== null) await this.startPromise.catch(() => undefined); // let the startup finish first

    this.state = 'stopping';
    const errors = await this.stopStarted();
    this.state = 'stopped';
    return errors;
  }

  private async loadAll(): Promise<Instance[]> {
    const load = this.options.load ?? loadServerModule;
    const instances: Instance[] = [];

    for (const loaded of this.registry.modules) {
      if (!loaded.manifest.parts.includes('server')) {
        this.log.debug(`module ${loaded.id} has no server part`);
        continue;
      }
      let implementation: ServerModule | null;
      try {
        implementation = await load(loaded);
      } catch (error) {
        throw new ModuleError('load', loaded.id, error);
      }
      if (implementation === null) continue;
      instances.push({ loaded, implementation, context: this.createContext(loaded) });
    }
    return instances;
  }

  private async registerAll(instances: Instance[]): Promise<void> {
    for (const { loaded, implementation, context } of instances) {
      this.capabilities.setRegistering(loaded.id);
      try {
        await implementation.register(context);
      } catch (error) {
        throw new ModuleError('register', loaded.id, error);
      } finally {
        this.capabilities.setRegistering(null);
      }

      const provided = this.capabilities.providedBy(loaded.id);
      const missing = declaredCapabilities(loaded).filter((name) => !provided.includes(name));
      if (missing.length > 0) {
        const names = missing.map((name) => `"${name}"`).join(', ');
        throw new ModuleError(
          'register',
          loaded.id,
          new Error(
            `it declares that it provides ${names}, but did not call capabilities.provide() for it`,
          ),
        );
      }
      this.log.debug(`module ${loaded.id} registered`);
    }
  }

  private async migrate(): Promise<void> {
    if (this.options.migrate === undefined) return;
    try {
      await this.options.migrate();
    } catch (error) {
      throw new ModuleError('migrate', undefined, error);
    }
  }

  private async startAll(instances: Instance[]): Promise<void> {
    for (const instance of instances) {
      const { loaded, implementation, context } = instance;
      if (implementation.start !== undefined) {
        try {
          await implementation.start(context);
        } catch (error) {
          throw new ModuleError('start', loaded.id, error);
        }
      }
      this.started.push(instance);
      this.log.debug(`module ${loaded.id} started`);
    }
  }

  /** Lets listeners that are still running finish, so they do not run against stopped modules. */
  private async drainEvents(): Promise<void> {
    try {
      await this.within(() => this.events.idle());
    } catch {
      this.log.warn('some event listeners were still running when the modules were stopped');
    }
  }

  private async stopStarted(): Promise<ModuleError[]> {
    const errors: ModuleError[] = [];
    if (this.started.length > 0) await this.drainEvents();
    while (this.started.length > 0) {
      const { loaded, implementation, context } = this.started.pop() as Instance;
      if (implementation.stop === undefined) continue;
      try {
        await this.within(() => implementation.stop?.(context));
        this.log.debug(`module ${loaded.id} stopped`);
      } catch (error) {
        const moduleError = new ModuleError('stop', loaded.id, error);
        errors.push(moduleError);
        this.log.error(moduleError.message);
      }
    }
    return errors;
  }

  /** Runs `action`, but gives up when it takes longer than the stop timeout. */
  private async within(action: () => void | Promise<void>): Promise<void> {
    const limit = this.options.stopTimeoutMs ?? 10_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`did not stop within ${limit} ms`)), limit);
    });
    try {
      await Promise.race([Promise.resolve().then(action), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  private createContext(loaded: LoadedModule): ModuleContext {
    return Object.freeze({
      id: loaded.id,
      config: loaded.config,
      dataDir: this.options.dataDir,
      log: createLogger(loaded.id, this.sink),
      routes: this.options.routes ?? pendingRoutes,
      events: this.events.scoped(loaded.id),
      hooks: this.hooks.scoped(loaded.id),
      capabilities: this.capabilities.accessFor(loaded),
    });
  }
}

function declaredCapabilities(loaded: LoadedModule): string[] {
  return (loaded.manifest.provides ?? []).map((item) =>
    typeof item === 'string' ? item : item.name,
  );
}
