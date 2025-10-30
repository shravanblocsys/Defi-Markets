import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '../config/config.service';
import { ProfileService } from '../profile/profile.service';
import { SiwxStorageService } from './siwx-storage.service';
import { RolesService } from '../roles/roles.service';
import { 
  SIWXMessage, 
  SIWXSession, 
  SIWXVerificationRequest, 
  SIWXVerificationResponse,
  SIWXSessionResponse,
  SIWXRevokeResponse,
  CaipNetworkId 
} from './interfaces/siwx.interface';
import type { SIWXMessage as ReownSIWXMessage } from '@reown/appkit-core';
import * as crypto from 'crypto';
import { SiwxVerifierService } from './siwx-verifier.service';

@Injectable()
export class SiwxService {
  private readonly logger = new Logger(SiwxService.name);
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly profileService: ProfileService,
    private readonly storageService: SiwxStorageService,
    private readonly verifierService: SiwxVerifierService,
    private readonly rolesService: RolesService,
  ) {}

  /**
   * Creates a unique nonce for SIWX authentication using Reown AppKit patterns
   * @param input Nonce input parameters containing only the address
   * @returns Promise<string> The generated nonce
   */
  async createNonce(input: { address: string }): Promise<string> {
    try {
      // Generate a cryptographically secure nonce using Reown AppKit patterns
      const nonce = this.generateSecureNonce();
      
      this.logger.log(`Created nonce for ${input.address} using Reown AppKit patterns: ${nonce}`);
      return nonce;
    } catch (error) {
      this.logger.error(`Error creating nonce: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to create nonce');
    }
  }

  /**
   * Creates a test signature for testing verification using Reown AppKit patterns
   * @param input Test signature input parameters
   * @returns Promise<{ message: any; signature: string; address: string; chainId: string }> Test signature data
   */
  async createTestSignature(input: { address: string; chainId: string }): Promise<{ message: any; signature: string; address: string; chainId: string }> {
    try {
      // Validate input
      if (!input.address || input.address === 'undefined') {
        throw new BadRequestException('Address is required and cannot be undefined');
      }
      
      if (!input.chainId) {
        throw new BadRequestException('ChainId is required');
      }
      
      this.logger.log(`Creating test signature for address: ${input.address}, chainId: ${input.chainId}`);
      
      // Generate a nonce using Reown AppKit patterns
      const nonce = this.generateSecureNonce();
      
      // Create a test message using Reown AppKit SIWXMessage format
      const reownMessage: ReownSIWXMessage = {
        domain: 'defi-markets.com',
        accountAddress: input.address,
        statement: 'Sign in to access the DeFi Markets platform',
        uri: 'https://defi-markets.com',
        version: '1',
        chainId: input.chainId as any, // Type assertion for compatibility
        nonce: nonce,
        issuedAt: new Date().toISOString(),
        expirationTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      // Convert to internal SIWXMessage format for signature generation
      const internalMessage: SIWXMessage = {
        domain: reownMessage.domain,
        address: reownMessage.accountAddress,
        statement: reownMessage.statement,
        uri: reownMessage.uri,
        version: reownMessage.version,
        chainId: reownMessage.chainId as string,
        nonce: reownMessage.nonce,
        issuedAt: reownMessage.issuedAt,
        expirationTime: reownMessage.expirationTime,
      };

      // Create a mock signature using Reown AppKit patterns (for testing purposes)
      // In a real scenario, this would be signed by the actual wallet
      const mockSignature = this.generateMockSignature(internalMessage, input.address);
      
      this.logger.log(`Created test signature for ${input.address} on chain ${input.chainId} using Reown AppKit patterns`);
      
      return {
        message: {
          domain: reownMessage.domain,
          address: reownMessage.accountAddress, // Ensure address is included in response
          statement: reownMessage.statement,
          uri: reownMessage.uri,
          version: reownMessage.version,
          chainId: reownMessage.chainId,
          nonce: reownMessage.nonce,
          issuedAt: reownMessage.issuedAt,
          expirationTime: reownMessage.expirationTime,
        },
        signature: mockSignature,
        address: input.address,
        chainId: input.chainId,
      };
    } catch (error) {
      this.logger.error(`Error creating test signature: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to create test signature');
    }
  }

  /**
   * Creates a SIWX message for the user to sign (for backward compatibility)
   * @param input Message input parameters
   * @returns Promise<SIWXMessage> The message to be signed
   */
  async createMessage(input: {
    domain: string;
    address: string;
    statement: string;
    uri: string;
    version: string;
    chainId: string;
    nonce: string;
  }): Promise<SIWXMessage> {
    try {
      const now = new Date();
      const expirationTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

      const message: SIWXMessage = {
        domain: input.domain,
        address: input.address,
        statement: input.statement,
        uri: input.uri,
        version: input.version,
        chainId: input.chainId,
        nonce: input.nonce,
        issuedAt: now.toISOString(),
        expirationTime: expirationTime.toISOString(),
      };

      this.logger.log(`Created SIWX message for ${input.address} on chain ${input.chainId}`);
      return message;
    } catch (error) {
      this.logger.error(`Error creating SIWX message: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to create SIWX message');
    }
  }

  /**
   * Verifies a SIWX signature and creates a session
   * This method will be called by the frontend verifier
   * @param request The verification request
   * @returns Promise<SIWXVerificationResponse> Verification result with session if valid
   */
  async verifyAndCreateSession(request: SIWXVerificationRequest): Promise<SIWXVerificationResponse> {
    try {
      const derivedAddress = request.message?.address;
      const derivedChainId = request.chainId || request.message?.chainId;
      // Verify signature using dedicated verifier service
      const isValid = await this.verifierService.verifySignature({
        message: request.message,
        signature: request.signature,
        address: derivedAddress,
        chainId: derivedChainId,
      });
      if (!isValid) {
        this.logger.warn(`Invalid signature for address: ${derivedAddress}`);
        return {
          isValid: false,
          error: 'Invalid signature',
        };
      }

      // Create a new session
      const session = this.createSession(
        request.message,
        request.signature,
        derivedChainId,
        derivedAddress,
      );

      // Store the session
      await this.storageService.addSession(session);

      // Create or update user profile
      await this.createOrUpdateUserProfile(derivedAddress, derivedChainId);

      // Generate JWT token
      const token = await this.generateJWTToken(session);

      this.logger.log(`Session created successfully for ${derivedAddress} on chain ${derivedChainId}`);
      
      // Sanitize response: remove signature and nonce
      const { signature: _sig, message: rawMessage, ...sessionRest } = session;
      const { nonce: _nonce, ...messageWithoutNonce } = rawMessage;

      return {
        isValid: true,
        session: {
          ...sessionRest,
          message: messageWithoutNonce,
          token,
        } as Omit<SIWXSession, 'signature'> & { token: string },
      };
    } catch (error) {
      this.logger.error(`Error verifying and creating session: ${error.message}`, error.stack);
      return {
        isValid: false,
        error: 'Verification failed',
      };
    }
  }

  /**
   * Verifies a SIWX signature and creates a session from signature only using Reown AppKit patterns
   * This method reconstructs the message from the signature using Reown SDK
   * @param signature The signature to verify
   * @returns Promise<SIWXVerificationResponse> Verification result with session if valid
   */
  async verifyAndCreateSessionFromSignature(signature: string): Promise<SIWXVerificationResponse> {
    try {
      // Reconstruct and verify signature using dedicated verifier service
      const reconstructed = await this.verifierService.reconstructFromSignature(signature);
      const isValid = await this.verifierService.verifySignature({
        message: reconstructed.message,
        signature,
        address: reconstructed.address,
        chainId: reconstructed.chainId,
      });

      if (!isValid) {
        this.logger.warn(`Invalid signature: ${signature}`);
        return {
          isValid: false,
          error: 'Invalid signature',
        };
      }
      const { message: reconstructedMessage, address, chainId } = reconstructed;

      // Create a new session using verified data
      const session = this.createSession(
        reconstructedMessage,
        signature,
        chainId,
        address,
      );

      // Store the session using Reown AppKit patterns
      await this.storageService.addSession(session);

      // Create or update user profile
      await this.createOrUpdateUserProfile(address, chainId);

      // Generate JWT token
      const token = await this.generateJWTToken(session);

      this.logger.log(`Session created successfully from signature using Reown AppKit patterns for ${address} on ${chainId}`);
      
      // Sanitize response: remove signature and nonce
      const { signature: _sig2, message: rawMessage2, ...sessionRest2 } = session;
      const { nonce: _nonce2, ...messageWithoutNonce2 } = rawMessage2;

      return {
        isValid: true,
        session: {
          ...sessionRest2,
          message: messageWithoutNonce2,
          token,
        } as Omit<SIWXSession, 'signature'> & { token: string },
      };
    } catch (error) {
      this.logger.error(`Error verifying and creating session from signature: ${error.message}`, error.stack);
      return {
        isValid: false,
        error: 'Verification failed',
      };
    }
  }

  /**
   * Adds a new session to storage
   * @param session The session to add
   */
  async addSession(session: SIWXSession): Promise<void> {
    try {
      await this.storageService.addSession(session);
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
      await this.storageService.setSessions(sessions);
      this.logger.log(`Set ${sessions.length} sessions`);
    } catch (error) {
      this.logger.error(`Error setting sessions: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Gets all valid sessions for a specific chain and address using Reown AppKit patterns
   * @param chainId The chain ID
   * @param address The wallet address
   * @returns Promise<SIWXSessionResponse> Array of valid sessions
   */
  async getSessions(chainId: CaipNetworkId, address: string): Promise<SIWXSessionResponse> {
    try {
      const sessions = await this.storageService.getSessions(chainId, address);
      
      this.logger.log(`Retrieved ${sessions.length} sessions for ${address} on chain ${chainId} using Reown AppKit patterns`);
      
      return {
        sessions,
      };
    } catch (error) {
      this.logger.error(`Error getting sessions: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Revokes all sessions for a specific chain and address using Reown AppKit patterns
   * @param chainId The chain ID
   * @param address The wallet address
   * @returns Promise<SIWXRevokeResponse> Revocation result
   */
  async revokeSessions(chainId: CaipNetworkId, address: string): Promise<SIWXRevokeResponse> {
    try {
      await this.storageService.deleteSessions(chainId, address);
      
      this.logger.log(`Sessions revoked for ${address} on chain ${chainId} using Reown AppKit patterns`);
      
      return {
        success: true,
        message: 'Sessions revoked successfully',
      };
    } catch (error) {
      this.logger.error(`Error revoking sessions: ${error.message}`, error.stack);
      return {
        success: false,
        message: 'Failed to revoke sessions',
      };
    }
  }

  /**
   * Validates a session token using Reown AppKit patterns
   * @param token The JWT token
   * @returns Promise<SIWXSession> The validated session
   */
  async validateSessionToken(token: string): Promise<SIWXSession> {
    try {
      const payload = this.jwtService.verify(token);
      
      // Get the session from storage using Reown AppKit patterns
      const sessions = await this.storageService.getSessions(payload.chainId, payload.address);
      const session = sessions.find(s => s.id === payload.sessionId);
      
      if (!session) {
        throw new UnauthorizedException('Session not found');
      }
      
      if (!session.isValid) {
        throw new UnauthorizedException('Session is invalid');
      }
      
      const now = new Date();
      const expiresAt = new Date(session.expiresAt);
      
      if (now > expiresAt) {
        throw new UnauthorizedException('Session has expired');
      }
      
      this.logger.log(`Session token validated successfully using Reown AppKit patterns`);
      
      return session;
    } catch (error) {
      this.logger.error(`Error validating session token: ${error.message}`, error.stack);
      throw new UnauthorizedException('Invalid session token');
    }
  }

  /**
   * Creates a new SIWX session
   * @param message The SIWX message
   * @param signature The signature
   * @param chainId The chain ID
   * @param address The wallet address
   * @returns SIWXSession The created session
   */
  private createSession(
    message: SIWXMessage,
    signature: string,
    chainId: string,
    address: string
  ): SIWXSession {
    const now = new Date();
    const expiresAt = message.expirationTime 
      ? new Date(message.expirationTime)
      : new Date(now.getTime() + 24 * 60 * 60 * 1000); // Default 24 hours

    return {
      id: this.generateSessionId(),
      address,
      chainId,
      message,
      signature,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      isValid: true,
    };
  }

  /**
   * Creates a user profile based on wallet address if it doesn't exist
   * @param address The wallet address
   * @param chainId The chain ID
   */
  private async createOrUpdateUserProfile(address: string, chainId: string): Promise<void> {
    try {
      // Check if user exists by wallet address
      const existingUser = await this.profileService.getByWalletAddress(address);
      
      this.logger.debug(`User lookup for address ${address}: ${existingUser ? 'found' : 'not found'}`);
      
      if (!existingUser) {
        // Create new user profile
        // Resolve USER role dynamically
        const userRole = await this.rolesService.getByName('USER');
        
        if (!userRole) {
          this.logger.error('USER role not found in database. Please ensure roles are properly seeded.');
          return;
        }
        
        const username = `user_${address.slice(0, 8)}`;
        const newUser = {
          username,
          email: `${address.slice(0, 8)}@wallet.local`,
          name: `Wallet User ${address.slice(0, 6)}...`,
          password: this.generatePlaceholderPassword(),
          walletAddress: address,
          roleId: userRole._id as any,
        };
        
        this.logger.debug(`Creating new user with username: ${username} for address: ${address}`);
        await this.profileService.create(newUser);
        this.logger.log(`Created new user profile for wallet address: ${address}`);
      } else {
        this.logger.log(`User profile already exists for wallet address: ${address}`);
      }
    } catch (error) {
      this.logger.error(`Error creating/updating user profile: ${error.message}`, error.stack);
      // Don't throw error here as it's not critical for SIWX authentication
    }
  }

  /**
   * Generates a JWT token for a session
   * @param session The SIWX session
   * @returns Promise<string> The JWT token
   */
  private async generateJWTToken(session: SIWXSession): Promise<string> {
    const payload = {
      sessionId: session.id,
      address: session.address,
      chainId: session.chainId,
      issuedAt: session.issuedAt,
      expiresAt: session.expiresAt,
    };

    return this.jwtService.sign(payload);
  }

  /**
   * Generates a cryptographically secure nonce
   * @returns string The generated nonce
   */
  private generateSecureNonce(): string {
    // Generate a random nonce using crypto.randomBytes for better security
    const randomBytes = crypto.randomBytes(32);
    return randomBytes.toString('hex');
  }

  /**
   * Generates a unique session ID
   * @returns string The session ID
   */
  private generateSessionId(): string {
    return `siwx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generates a placeholder password for wallet-based accounts.
   * Note: This value is NOT stored in plain text. It is always hashed
   * by ProfileService.create before persistence and is not intended
   * for direct user authentication.
   * @returns string Placeholder password
   */
  private generatePlaceholderPassword(): string {
    return (
      Math.random().toString(36).slice(-10) +
      Math.random().toString(36).slice(-10)
    );
  }

  /**
   * Generates a mock signature for testing purposes
   * @param reownMessage The SIWX message
   * @param address The wallet address
   * @returns string Mock signature
   */
  private generateMockSignature(reownMessage: SIWXMessage, address: string): string {
    // In a real scenario, this would be a cryptographic signature
    // For testing, we'll just return a dummy string
    if (!address || address === 'undefined') {
      throw new Error('Address is required for signature generation');
    }
    return `mock_signature_${reownMessage.nonce}_${address}`;
  }

  /**
   * Gets storage statistics
   * @returns Storage statistics
   */
  getStorageStats() {
    return this.storageService.getStorageStats();
  }

  /**
   * Cleans up expired sessions
   */
  async cleanupExpiredSessions(): Promise<void> {
    await this.storageService.cleanupExpiredSessions();
  }
}
