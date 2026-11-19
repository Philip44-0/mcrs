import { createMemoryStorage } from './memory-storage';
import { runStorageConformance } from './storage';

// The reference storage has to pass the suite itself: this checks the suite against the contract.
runStorageConformance(() => ({ storage: createMemoryStorage() }), { name: 'memory storage' });
