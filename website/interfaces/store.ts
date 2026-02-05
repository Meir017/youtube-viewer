// Re-export store interface from the main store module
// This provides a clean interface for dependency injection

export type { ChannelsStore, StoreInterface } from '../store';
export { createStore, createInMemoryStore, loadStore, saveStore, ensureDataDir } from '../store';
