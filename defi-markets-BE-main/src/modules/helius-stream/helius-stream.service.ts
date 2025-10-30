import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import * as crypto from 'crypto';
import { decodeVaultInstruction } from '../../utils/utils';

export interface HeliusWebhookData {
  type: string;
  description?: string;
  signature?: string;
  slot?: number;
  timestamp?: number;
  instructions?: Array<{
    accounts: string[];
    data: string;
    programId: string;
    innerInstructions?: Array<{
      accounts: string[];
      data: string;
      programId: string;
    }>;
  }>;
  accountData?: Array<{
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges: any[];
  }>;
  nativeTransfers?: Array<{
    amount: number;
    fromUserAccount: string;
    toUserAccount: string;
  }>;
  feePayer?: string;
  fee?: number;
  [key: string]: any;
}

export interface EventProcessingResult {
  success: boolean;
  eventType?: string;
  message?: string;
  error?: string;
  data?: any;
}

/**
 * Service for processing Helius webhook data and detecting vault creation events.
 * 
 * @warning ABI COUPLING: This service is tightly coupled to the vault factory ABI structure.
 * 
 * @warning SECURITY: Webhook signature verification uses constant-time comparison
 * to prevent timing attacks. All secret/signature comparisons use crypto.timingSafeEqual.
 * 
 * @note SECURITY: Only secure signature methods are supported. MD5 has been removed
 * as it is cryptographically broken. If Helius requires MD5, this must be documented
 * and implemented securely with proper justification.
 * 
 * Key ABI Dependencies:
 * - createVault instruction account order: [factory, vault, creator, etfVaultProgram, systemProgram]
 * - System Program ID: 11111111111111111111111111111111
 * - Minimum account count: 5
 * 
 * If the vault factory ABI changes, the following methods must be updated:
 * - extractETFVaultProgramId()
 * - hasCreateVaultAccountStructure()
 * - CREATE_VAULT_ACCOUNT_STRUCTURE constants
 * 
 * To make this more robust in the future, consider:
 * 1. Using ABI parsing libraries to dynamically extract account information
 * 2. Implementing account type detection based on program IDs
 * 3. Adding ABI versioning and compatibility checks
 * 4. Using metadata or account discriminators to identify account types
 */
@Injectable()
export class HeliusStreamService {
  private readonly logger = new Logger(HeliusStreamService.name);

  // System Program ID (constant)
  private readonly SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

  // ABI-defined account structure constants for createVault instruction
  private readonly CREATE_VAULT_ACCOUNT_STRUCTURE = {
    FACTORY_INDEX: 0,
    VAULT_INDEX: 1,
    CREATOR_INDEX: 2,
    ETF_VAULT_PROGRAM_INDEX: 3,
    SYSTEM_PROGRAM_INDEX: 4,
    MIN_ACCOUNT_COUNT: 5
  };

  // Expected account names for createVault instruction (for logging/debugging)
  private readonly CREATE_VAULT_ACCOUNT_NAMES = [
    'factory', 'vault', 'creator', 'etfVaultProgram', 'systemProgram'
  ];

  constructor(private readonly configService: ConfigService) {
    // Validate ABI structure constants on service initialization
    this.validateABIStructure();
  }

  /**
   * Get vault factory program ID from config
   */
  private get vaultFactoryProgramId(): string {
    return this.configService.get('SOLANA_VAULT_FACTORY_ADDRESS');
  }

  /**
   * Process Helius webhook data - detect vault creation events from instruction data
   */
  async processWebhookData(webhookData: HeliusWebhookData): Promise<EventProcessingResult> {
    try {
      this.logger.log(`Processing Helius event: ${webhookData.type}`);

      // Check if this is a vault creation event by examining instructions
      if (this.isVaultCreationEvent(webhookData)) {
        return await this.processVaultCreationEvent(webhookData);
      }

      // Log other event types but don't process them
      this.logger.log(`Skipping non-vault event type: ${webhookData.type}`);
      return {
        success: true,
        eventType: webhookData.type,
        message: 'Event type not vault-related, skipping'
      };
    } catch (error) {
      this.logger.error(`Error processing event ${webhookData.type}:`, error);
      return {
        success: false,
        eventType: webhookData.type,
        error: error.message
      };
    }
  }

  /**
   * Detect if this is a vault creation event by examining the instruction data
   */
  private isVaultCreationEvent(data: HeliusWebhookData): boolean {
    this.logger.log(`Checking if event is vault creation...`);

    // Check if instructions exist and contain vault factory program
    if (!data.instructions || data.instructions.length === 0) {
      this.logger.log(`No instructions found in webhook data`);
      return false;
    }

    this.logger.log(`Found ${data.instructions.length} instructions`);

    // Look for instructions that interact with the vault factory program
    const hasVaultFactoryInstruction = data.instructions.some(instruction =>
      instruction.programId === this.vaultFactoryProgramId
    );

    this.logger.log(`Has vault factory instruction: ${hasVaultFactoryInstruction}`);
    this.logger.log(`Looking for program ID: ${this.vaultFactoryProgramId}`);

    // If we have a vault factory instruction, it's likely a vault creation
    // We'll do more detailed parsing in the processing method
    if (hasVaultFactoryInstruction) {
      this.logger.log(`✅ Vault factory instruction detected - likely a vault creation event`);
      return true;
    }

    this.logger.log(`❌ No vault factory instruction found`);
    return false;
  }

  /**
   * Check if the account structure matches createVault instruction from ABI
   * 
   * @warning This method is tightly coupled to the vault factory ABI structure.
   * If the ABI changes, this method must be updated accordingly.
   */
  private hasCreateVaultAccountStructure(data: HeliusWebhookData): boolean {
    if (!data.instructions || data.instructions.length === 0) {
      return false;
    }

    // From your ABI: createVault accounts are [factory, vault, creator, etfVaultProgram, systemProgram]
    const createVaultInstruction = data.instructions.find(instruction =>
      instruction.programId === this.vaultFactoryProgramId
    );

    if (!createVaultInstruction) {
      this.logger.log(`No vault factory instruction found. Looking for program ID: ${this.vaultFactoryProgramId}`);
      return false;
    }

    // Check if we have the expected accounts for createVault
    const accounts = createVaultInstruction.accounts;

    // Should have at least 5 accounts: factory, vault, creator, etfVaultProgram, systemProgram
    if (accounts.length < this.CREATE_VAULT_ACCOUNT_STRUCTURE.MIN_ACCOUNT_COUNT) {
      this.logger.log(`Insufficient accounts. Expected ${this.CREATE_VAULT_ACCOUNT_STRUCTURE.MIN_ACCOUNT_COUNT}, got ${accounts.length}`);
      return false;
    }

    // Check if system program (11111111111111111111111111111111) is present
    const hasSystemProgram = accounts.includes(this.SYSTEM_PROGRAM_ID);

    // Check if the factory account matches the configured vault factory address
    const factoryAccount = accounts[this.CREATE_VAULT_ACCOUNT_STRUCTURE.FACTORY_INDEX];
    const hasCorrectFactory = factoryAccount === this.vaultFactoryProgramId;

    // Debug logging
    this.logger.log(`Vault creation validation:`);
    this.logger.log(`  Factory account: ${factoryAccount}`);
    this.logger.log(`  Expected factory: ${this.vaultFactoryProgramId}`);
    this.logger.log(`  Has correct factory: ${hasCorrectFactory}`);
    this.logger.log(`  Has system program: ${hasSystemProgram}`);
    this.logger.log(`  Account structure: [${this.CREATE_VAULT_ACCOUNT_NAMES.join(', ')}]`);
    this.logger.log(`  Actual accounts: [${accounts.join(', ')}]`);

    return hasSystemProgram && hasCorrectFactory;
  }

  /**
   * Extract ETF vault program ID from the instruction accounts
   * 
   * @warning This method is tightly coupled to the vault factory ABI structure.
   * If the ABI changes, this method must be updated accordingly.
   * 
   * Current ABI structure for createVault:
   * [factory, vault, creator, etfVaultProgram, systemProgram]
   * 
   * @param data - Helius webhook data containing instructions
   * @returns ETF vault program ID or null if not found
   */
  private extractETFVaultProgramId(data: HeliusWebhookData): string | null {
    if (!data.instructions || data.instructions.length === 0) {
      this.logger.log('No instructions found for ETF vault program ID extraction');
      return null;
    }

    const createVaultInstruction = data.instructions.find(instruction =>
      instruction.programId === this.vaultFactoryProgramId
    );

    if (!createVaultInstruction) {
      this.logger.log('No vault factory instruction found for ETF vault program ID extraction');
      return null;
    }

    const accounts = createVaultInstruction.accounts;

    // Validate minimum account count based on ABI
    if (accounts.length < this.CREATE_VAULT_ACCOUNT_STRUCTURE.MIN_ACCOUNT_COUNT) {
      this.logger.warn(`Insufficient accounts for createVault. Expected ${this.CREATE_VAULT_ACCOUNT_STRUCTURE.MIN_ACCOUNT_COUNT}, got ${accounts.length}`);
      return null;
    }

    // Validate account structure by checking known constants
    const factoryAccount = accounts[this.CREATE_VAULT_ACCOUNT_STRUCTURE.FACTORY_INDEX];
    const systemProgramAccount = accounts[this.CREATE_VAULT_ACCOUNT_STRUCTURE.SYSTEM_PROGRAM_INDEX];

    // Validate factory account matches expected vault factory address
    if (factoryAccount !== this.vaultFactoryProgramId) {
      this.logger.warn(`Invalid factory account. Expected ${this.vaultFactoryProgramId}, got ${factoryAccount}`);
      return null;
    }

    // Validate system program account
    if (systemProgramAccount !== this.SYSTEM_PROGRAM_ID) {
      this.logger.warn(`Invalid system program account. Expected ${this.SYSTEM_PROGRAM_ID}, got ${systemProgramAccount}`);
      return null;
    }

    // Extract ETF vault program ID using constant index
    const etfVaultProgramId = accounts[this.CREATE_VAULT_ACCOUNT_STRUCTURE.ETF_VAULT_PROGRAM_INDEX];

    // Additional validation: ETF vault program should not be the same as system program or factory
    if (etfVaultProgramId === this.SYSTEM_PROGRAM_ID) {
      this.logger.warn('ETF vault program ID matches system program ID - likely invalid');
      return null;
    }

    if (etfVaultProgramId === this.vaultFactoryProgramId) {
      this.logger.warn('ETF vault program ID matches vault factory program ID - likely invalid');
      return null;
    }

    // Log successful extraction for debugging
    this.logger.log(`Successfully extracted ETF vault program ID: ${etfVaultProgramId}`);
    this.logger.log(`Account structure validation passed: [${this.CREATE_VAULT_ACCOUNT_NAMES.join(', ')}]`);

    return etfVaultProgramId;
  }

  /**
   * Process vault creation events
   */
  private async processVaultCreationEvent(data: HeliusWebhookData): Promise<EventProcessingResult> {
    try {
      this.logger.log(`🏦 Vault Creation detected from instruction data!`);

      this.logger.log("instruction Data:", data);
      // Extract ETF vault program ID dynamically
      const etfVaultProgramId = this.extractETFVaultProgramId(data);

      // Log instruction details
      if (data.instructions) {
        // Find the vault factory instruction explicitly
        const vaultFactoryInstruction = data.instructions.find(ix => ix.programId === this.vaultFactoryProgramId);
        
        if (vaultFactoryInstruction) {
          const instruction = decodeVaultInstruction(vaultFactoryInstruction.data);
          this.logger.log("🏦 Decoded instruction:", instruction);
          
          // Process inner instructions if they exist
          if (vaultFactoryInstruction.innerInstructions && vaultFactoryInstruction.innerInstructions.length > 0) {
            vaultFactoryInstruction.innerInstructions.forEach((inner, idx) => {
              // Only attempt to decode inner instructions from the vault factory program
              if (inner.programId === this.vaultFactoryProgramId) {
                try {
                  const decoded = decodeVaultInstruction(inner.data);
                  this.logger.log(`🏦 Decoded inner instruction [${idx}]:`, decoded);
                } catch (err) {
                  this.logger.error(`❌ Failed to decode inner instruction [${idx}]`, err);
                }
              } else {
                this.logger.log(`🏦 Skipping decoding for inner instruction [${idx}] from program ${inner.programId}`);
              }
            });
          }
        } else {
          this.logger.warn("No vault factory instruction found for decoding");
        }
        this.logger.log('🏦 Instructions:');
        data.instructions.forEach((instruction, index) => {
          if (instruction.programId === this.vaultFactoryProgramId) {
            this.logger.log(`   Instruction ${index + 1} (Vault Factory - createVault):`);
            this.logger.log(`     Program ID: ${instruction.programId}`);
            this.logger.log(`     Accounts Count: ${instruction.accounts.length}`);
            this.logger.log(`     Data Length: ${instruction.data.length} bytes`);
            this.logger.log(`     Raw Data: ${instruction.data}`);

            // Log account details for createVault instruction
            if (instruction.accounts.length >= this.CREATE_VAULT_ACCOUNT_STRUCTURE.MIN_ACCOUNT_COUNT) {
              this.logger.log(`     Factory: ${instruction.accounts[this.CREATE_VAULT_ACCOUNT_STRUCTURE.FACTORY_INDEX]}`);
              this.logger.log(`     Vault: ${instruction.accounts[this.CREATE_VAULT_ACCOUNT_STRUCTURE.VAULT_INDEX]}`);
              this.logger.log(`     Creator: ${instruction.accounts[this.CREATE_VAULT_ACCOUNT_STRUCTURE.CREATOR_INDEX]}`);
              this.logger.log(`     ETF Vault Program: ${instruction.accounts[this.CREATE_VAULT_ACCOUNT_STRUCTURE.ETF_VAULT_PROGRAM_INDEX]}`);
              this.logger.log(`     System Program: ${instruction.accounts[this.CREATE_VAULT_ACCOUNT_STRUCTURE.SYSTEM_PROGRAM_INDEX]}`);
            }
          } else {
            this.logger.log(`   Instruction ${index + 1} (Other):`);
            this.logger.log(`     Program ID: ${instruction.programId}`);
            this.logger.log(`     Accounts Count: ${instruction.accounts.length}`);
            this.logger.log(`     Data Length: ${instruction.data.length} bytes`);
          }
        });
      }

      // Log account data changes
      if (data.accountData) {
        this.logger.log('🏦 Account Changes:');
        data.accountData.forEach((account, index) => {
          if (account.nativeBalanceChange !== 0 || account.tokenBalanceChanges.length > 0) {
            this.logger.log(`   Account ${index + 1}: ${account.account}`);
            if (account.nativeBalanceChange !== 0) {
              this.logger.log(`     SOL Change: ${account.nativeBalanceChange / 1000000000}`);
            }
            if (account.tokenBalanceChanges.length > 0) {
              account.tokenBalanceChanges.forEach((tokenChange, tokenIndex) => {
                this.logger.log(`     Token ${tokenIndex + 1}: ${tokenChange.rawTokenAmount?.tokenAmount || 'N/A'} (${tokenChange.mint || 'N/A'})`);
              });
            }
          }
        });
      }

      // Log native transfers
      if (data.nativeTransfers && data.nativeTransfers.length > 0) {
        this.logger.log('🏦 Native Transfers:');
        data.nativeTransfers.forEach((transfer, index) => {
          this.logger.log(`   Transfer ${index + 1}:`);
          this.logger.log(`     Amount: ${transfer.amount / 1000000000} SOL`);
          this.logger.log(`     From: ${transfer.fromUserAccount}`);
          this.logger.log(`     To: ${transfer.toUserAccount}`);
        });
      }

      // Log inner instructions if any
      if (data.instructions && data.instructions.length > 0) {
        const vaultInstruction = data.instructions.find(ix => ix.programId === this.vaultFactoryProgramId);
        if (vaultInstruction && vaultInstruction.innerInstructions && vaultInstruction.innerInstructions.length > 0) {
          this.logger.log('🏦 Inner Instructions:');
          // Process all inner instructions, only attempting to decode those from the vault factory program
          vaultInstruction.innerInstructions.forEach((innerIx, index) => {
            this.logger.log(`   Inner Instruction ${index + 1}:`);
            this.logger.log(`     Program ID: ${innerIx.programId}`);
            this.logger.log(`     Accounts Count: ${innerIx.accounts.length}`);
            this.logger.log(`     Data Length: ${innerIx.data.length} bytes`);
            this.logger.log(`     Raw Data: ${innerIx.data}`);

            // Decode inner instruction data if possible
            try {
              if (innerIx.programId === this.vaultFactoryProgramId) {
                const decodedInnerIx = decodeVaultInstruction(innerIx.data);
                this.logger.log(`     Decoded Inner Data: ${JSON.stringify(decodedInnerIx, null, 2)}`);
              } else {
                this.logger.log(`     Skipping decoding for non-vault factory program instruction`);
              }
            } catch (error) {
              this.logger.log(`     Failed to decode inner instruction: ${error.message}`);
            }
          });
        }
      }

      this.logger.log('🏦 ======================================');

      // Here you can add your vault creation processing logic:
      // - Store vault data to database
      // - Trigger vault factory creation
      // - Send notifications
      // - Update analytics
      // - Integrate with other services

      return {
        success: true,
        eventType: 'vault_created',
        message: 'Vault creation event detected and processed successfully',
        data: {
          type: data.type,
          description: data.description || 'Vault creation via createVault instruction',
          slot: data.slot,
          signature: data.signature,
          timestamp: data.timestamp,
          feePayer: data.feePayer,
          fee: data.fee,
          vaultFactoryProgramId: this.vaultFactoryProgramId,
          etfVaultProgramId: etfVaultProgramId,
          instructions: data.instructions,
          accountData: data.accountData,
          nativeTransfers: data.nativeTransfers,
          detectedAsVaultCreation: true
        }
      };
    } catch (error) {
      this.logger.error('Error processing vault creation event:', error);
      return {
        success: false,
        eventType: 'vault_created',
        error: error.message
      };
    }
  }

  /**
   * Validate that the current ABI structure matches expected constants
   * This method helps catch ABI changes during development/testing
   */
  private validateABIStructure(): void {
    const { MIN_ACCOUNT_COUNT, FACTORY_INDEX, SYSTEM_PROGRAM_INDEX } = this.CREATE_VAULT_ACCOUNT_STRUCTURE;

    // Validate constant values match expected ABI structure
    if (MIN_ACCOUNT_COUNT !== 5) {
      this.logger.warn(`ABI structure validation failed: MIN_ACCOUNT_COUNT should be 5, got ${MIN_ACCOUNT_COUNT}`);
    }

    if (FACTORY_INDEX !== 0) {
      this.logger.warn(`ABI structure validation failed: FACTORY_INDEX should be 0, got ${FACTORY_INDEX}`);
    }

    if (SYSTEM_PROGRAM_INDEX !== 4) {
      this.logger.warn(`ABI structure validation failed: SYSTEM_PROGRAM_INDEX should be 4, got ${SYSTEM_PROGRAM_INDEX}`);
    }

    this.logger.log('ABI structure validation completed');
  }

  /**
   * Verify Helius webhook signature for security
   * 
   * @warning SECURITY: Uses constant-time comparison to prevent timing attacks
   * All secret/signature comparisons use crypto.timingSafeEqual for security
   * 
   * @note SECURITY: Only secure signature methods are supported:
   * - Direct secret comparison (if Helius sends the secret directly)
   * - HMAC SHA256 signature verification (recommended)
   * 
   * MD5 has been removed as it is cryptographically broken and insecure.
   * 
   * @important Before deploying, verify the correct signature method with Helius documentation:
   * - Check if they use HMAC SHA256 (recommended)
   * - Check if they send the secret directly
   * - If they require MD5, document the requirement and implement securely
   */
  verifyWebhookSignature(body: any, authHeader: string): boolean {
    const webhookSecret = this.configService.get('HELIUS_WEBHOOK_SECRET');
    if (!webhookSecret) {
      this.logger.log('❌ HELIUS_WEBHOOK_SECRET not configured');
      throw new Error('Webhook secret not configured');
    }

    if (!authHeader) {
      this.logger.log('❌ Authentication header not provided');
      throw new Error('Authentication header not provided');
    }

    this.logger.log(`🔐 Verifying webhook with secret: ${webhookSecret.substring(0, 8)}...`);
    this.logger.log(`🔐 Received auth header: ${authHeader}`);
    this.logger.log(`Verifying webhook with secret: ${webhookSecret.substring(0, 8)}...`);
    this.logger.log(`Received auth header: ${authHeader}`);

    // Method 1: Direct secret comparison (if Helius sends the secret directly)
    // SECURITY: Use constant-time comparison to prevent timing attacks
    if (this.constantTimeCompare(authHeader, webhookSecret)) {
      this.logger.log('✅ Authentication successful: Direct secret match');
      this.logger.log('Authentication successful: Direct secret match');
      return true;
    }

    // Method 2: HMAC SHA256 signature verification (recommended secure method)
    try {
      const bodyString = JSON.stringify(body);
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(bodyString)
        .digest('hex');

      this.logger.log(`🔐 Expected HMAC signature: ${expectedSignature}`);
      this.logger.log(`Expected HMAC signature: ${expectedSignature}`);

      // SECURITY: Use constant-time comparison to prevent timing attacks
      if (this.constantTimeCompare(authHeader, expectedSignature)) {
        this.logger.log('✅ Authentication successful: HMAC signature match');
        this.logger.log('Authentication successful: HMAC signature match');
        return true;
      }
    } catch (error) {
      console.error('❌ Error generating HMAC signature:', error);
      this.logger.error('Error generating HMAC signature:', error);
    }

    // SECURITY: MD5 verification removed - cryptographically broken and insecure
    // 
    // If Helius documentation explicitly requires MD5 verification:
    // 1. Document why MD5 is necessary (e.g., legacy system requirements)
    // 2. Implement with single update() call (not double as before)
    // 3. Use constant-time comparison (already implemented)
    // 4. Consider adding rate limiting to prevent brute force attacks
    // 5. Plan migration to secure alternatives (HMAC SHA256 recommended)
    // 
    // Example secure MD5 implementation (if required):
    // const expectedMd5 = crypto.createHash('md5').update(bodyString + webhookSecret).digest('hex');
    // if (this.constantTimeCompare(authHeader, expectedMd5)) { ... }

    this.logger.log('❌ All authentication methods failed');
    this.logger.error('All authentication methods failed');
    throw new Error('Invalid authentication header');
  }

  /**
   * Constant-time comparison of two strings to prevent timing attacks
   * 
   * @param a - First string to compare
   * @param b - Second string to compare
   * @returns true if strings are equal, false otherwise
   * 
   * @warning SECURITY: This method must always take the same amount of time
   * regardless of how many characters match between the strings.
   */
  private constantTimeCompare(a: string, b: string): boolean {
    try {
      // Convert strings to Uint8Array for timing-safe comparison
      // crypto.timingSafeEqual expects Uint8Array, not Buffer
      const arrayA = new Uint8Array(Buffer.from(a, 'utf8'));
      const arrayB = new Uint8Array(Buffer.from(b, 'utf8'));

      // Use crypto.timingSafeEqual for constant-time comparison
      // This prevents timing attacks by ensuring comparison always takes the same time
      return crypto.timingSafeEqual(arrayA, arrayB);
    } catch (error) {
      // If timingSafeEqual fails (e.g., different buffer lengths), return false
      // This maintains security by not revealing information about the comparison
      this.logger.warn('Error in constant-time comparison:', error);
      return false;
    }
  }
}
