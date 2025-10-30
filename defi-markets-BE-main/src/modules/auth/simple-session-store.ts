/**
 * Simple in-memory session store for OAuth state/PKCE
 * This is a minimal implementation to satisfy Passport's session requirement
 * without needing full express-session integration
 */
export class SimpleSessionStore {
  private store: Map<string, any> = new Map();

  /**
   * Store a value by key
   */
  set(key: string, value: any): void {
    this.store.set(key, value);
  }

  /**
   * Get a value by key
   */
  get(key: string): any {
    return this.store.get(key);
  }

  /**
   * Delete a value by key
   */
  delete(key: string): void {
    this.store.delete(key);
  }

  /**
   * Check if a key exists
   */
  has(key: string): boolean {
    return this.store.has(key);
  }
}

// Singleton instance
export const sessionStore = new SimpleSessionStore();
