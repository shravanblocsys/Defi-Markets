import { Injectable, Logger } from '@nestjs/common';
import { SIWXSession, CaipNetworkId } from './interfaces/siwx.interface';

@Injectable()
export class SiwxStorageService {
  private readonly logger = new Logger(SiwxStorageService.name);
  
  // In-memory storage - replace with database implementation for production
  private sessions: Map<string, SIWXSession[]> = new Map();

  /**
   * Adds a new session to storage
   * @param session The session to add
   */
  async addSession(session: SIWXSession): Promise<void> {
    try {
      const key = this.getStorageKey(session.chainId, session.address);
      const existingSessions = this.sessions.get(key) || [];
      
      // Remove expired sessions
      const validSessions = existingSessions.filter(s => this.isSessionValid(s));
      
      // Add new session
      validSessions.push(session);
      
      this.sessions.set(key, validSessions);
      
      this.logger.log(`Session added for ${session.address} on chain ${session.chainId}`);
    } catch (error) {
      this.logger.error(`Error adding session: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Sets all sessions for a specific chain and address
   * @param sessions Array of sessions to set
   */
  async setSessions(sessions: SIWXSession[]): Promise<void> {
    try {
      // Group sessions by chain and address
      const sessionGroups = new Map<string, SIWXSession[]>();
      
      for (const session of sessions) {
        const key = this.getStorageKey(session.chainId, session.address);
        if (!sessionGroups.has(key)) {
          sessionGroups.set(key, []);
        }
        sessionGroups.get(key)!.push(session);
      }
      
      // Replace all sessions
      for (const [key, sessionList] of sessionGroups) {
        this.sessions.set(key, sessionList);
      }
      
      this.logger.log(`Set ${sessions.length} sessions for ${sessionGroups.size} address/chain combinations`);
    } catch (error) {
      this.logger.error(`Error setting sessions: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Gets all valid sessions for a specific chain and address
   * @param chainId The chain ID
   * @param address The wallet address
   * @returns Array of valid sessions
   */
  async getSessions(chainId: CaipNetworkId, address: string): Promise<SIWXSession[]> {
    try {
      const key = this.getStorageKey(chainId, address);
      const sessions = this.sessions.get(key) || [];
      
      // Filter out expired and invalid sessions
      const validSessions = sessions.filter(session => this.isSessionValid(session));
      
      // Update storage to remove expired sessions
      if (validSessions.length !== sessions.length) {
        this.sessions.set(key, validSessions);
      }
      
      this.logger.log(`Retrieved ${validSessions.length} valid sessions for ${address} on chain ${chainId}`);
      return validSessions;
    } catch (error) {
      this.logger.error(`Error getting sessions: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Deletes all sessions for a specific chain and address
   * @param chainId The chain ID
   * @param address The wallet address
   */
  async deleteSessions(chainId: CaipNetworkId, address: string): Promise<void> {
    try {
      const key = this.getStorageKey(chainId, address);
      const deleted = this.sessions.delete(key);
      
      if (deleted) {
        this.logger.log(`Deleted sessions for ${address} on chain ${chainId}`);
      } else {
        this.logger.warn(`No sessions found to delete for ${address} on chain ${chainId}`);
      }
    } catch (error) {
      this.logger.error(`Error deleting sessions: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Gets all sessions across all chains and addresses (for admin purposes)
   * @returns Array of all sessions
   */
  async getAllSessions(): Promise<SIWXSession[]> {
    try {
      const allSessions: SIWXSession[] = [];
      
      for (const sessions of this.sessions.values()) {
        allSessions.push(...sessions.filter(session => this.isSessionValid(session)));
      }
      
      return allSessions;
    } catch (error) {
      this.logger.error(`Error getting all sessions: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Cleans up expired sessions
   */
  async cleanupExpiredSessions(): Promise<void> {
    try {
      let totalRemoved = 0;
      
      for (const [key, sessions] of this.sessions.entries()) {
        const validSessions = sessions.filter(session => this.isSessionValid(session));
        const removed = sessions.length - validSessions.length;
        
        if (removed > 0) {
          this.sessions.set(key, validSessions);
          totalRemoved += removed;
        }
      }
      
      if (totalRemoved > 0) {
        this.logger.log(`Cleaned up ${totalRemoved} expired sessions`);
      }
    } catch (error) {
      this.logger.error(`Error cleaning up expired sessions: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Checks if a session is still valid
   * @param session The session to check
   * @returns True if the session is valid
   */
  private isSessionValid(session: SIWXSession): boolean {
    if (!session.isValid) {
      return false;
    }
    
    const now = new Date();
    const expiresAt = new Date(session.expiresAt);
    
    return now < expiresAt;
  }

  /**
   * Generates a storage key for a chain and address combination
   * @param chainId The chain ID
   * @param address The wallet address
   * @returns Storage key
   */
  private getStorageKey(chainId: string, address: string): string {
    return `${chainId}:${address.toLowerCase()}`;
  }

  /**
   * Gets storage statistics (for monitoring purposes)
   */
  getStorageStats(): { totalSessions: number; totalAddresses: number } {
    let totalSessions = 0;
    const uniqueAddresses = new Set<string>();
    
    for (const [key, sessions] of this.sessions.entries()) {
      const validSessions = sessions.filter(session => this.isSessionValid(session));
      totalSessions += validSessions.length;
      
      if (validSessions.length > 0) {
        const [, address] = key.split(':');
        uniqueAddresses.add(address);
      }
    }
    
    return {
      totalSessions,
      totalAddresses: uniqueAddresses.size,
    };
  }
}
