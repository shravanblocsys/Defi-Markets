import { Injectable, Logger } from '@nestjs/common';
import { SIWXMessage } from './interfaces/siwx.interface';
import { ethers } from 'ethers';
// Use require for nacl to ensure proper runtime loading
const nacl = require('tweetnacl');
// Use require for bs58 to ensure proper runtime loading
const bs58 = require('bs58');

interface VerifySignatureInput {
  message: SIWXMessage;
  signature: string;
  address: string;
  chainId: string;
}

interface ReconstructedData {
  message: SIWXMessage;
  address: string;
  chainId: string;
}

@Injectable()
export class SiwxVerifierService {
  private readonly logger = new Logger(SiwxVerifierService.name);

  async verifySignature(input: VerifySignatureInput): Promise<boolean> {
    const { message, signature, address } = input;

    try {
      // Temporary strict check for mock signatures used in tests/dev
      if (signature.startsWith('mock_signature_')) {
        const parts = signature.split('_');
        if (parts.length >= 4) {
          const nonceFromSig = parts[2];
          const addressFromSig = parts[3];
          const matches = nonceFromSig === message.nonce &&
            addressFromSig.toLowerCase() === address.toLowerCase();
          if (!matches) {
            this.logger.warn('Mock signature does not match message or address');
          }
          return matches;
        }
        return false;
      }

      // Support EVM (eip155) chains using EIP-191 personal_sign with a SIWE-style message string
      if (input.chainId?.toLowerCase().startsWith('eip155:')) {
        // Validate required address
        if (!address || typeof address !== 'string' || address.trim().length === 0) {
          this.logger.warn('Missing or empty address for EVM signature verification');
          return false;
        }
        if (!ethers.isAddress(address)) {
          this.logger.warn('Invalid EVM address format');
          return false;
        }

        const signingString = this.buildSiweStyleMessage(message, address);
        try {
          const recovered = ethers.verifyMessage(signingString, signature);
          const matches = recovered.toLowerCase() === address.toLowerCase();
          if (!matches) {
            this.logger.warn('Recovered address does not match provided address for EVM signature');
          }
          return matches;
        } catch (e) {
          this.logger.warn(`EVM signature verification failed: ${(e as Error).message}`);
          return false;
        }
      }

      // Support Solana (CAIP: solana:*) using ed25519 verification
      if (input.chainId?.toLowerCase().startsWith('solana:')) {
        // Validate provided address (base58-encoded public key)
        if (!address || typeof address !== 'string' || address.trim().length === 0) {
          this.logger.warn('Missing or empty address for Solana signature verification');
          return false;
        }

        try {
          const publicKeyBytes = bs58.decode(address);
          if (publicKeyBytes.length !== 32) {
            this.logger.warn('Invalid Solana public key length');
            return false;
          }

          
          // Build the message string similar to EIP-4361. Frontend MUST sign this exact string.
          const signingString = this.buildSiweStyleMessage(message, address);
          
          const messageBytes = new TextEncoder().encode(signingString);
          const signatureBytes = bs58.decode(signature);
          
          // Try the standard Ed25519 verification
          let ok = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
          
          if (!ok) {
            this.logger.warn('Standard Ed25519 verification failed, trying alternative methods...');
            
            // Try with the message.address instead of the parameter address
            if (message.address && message.address !== address) {
              this.logger.log(`Trying with message.address: ${message.address}`);
              const altSigningString = this.buildSiweStyleMessage(message, message.address);
              const altMessageBytes = new TextEncoder().encode(altSigningString);
              ok = nacl.sign.detached.verify(altMessageBytes, signatureBytes, publicKeyBytes);
              
              if (ok) {
                this.logger.log('Alternative verification successful with message.address');
              }
            }
            
            // If still failed, try with raw message object (some wallets might sign the JSON)
            if (!ok) {
              this.logger.log('Trying with raw message JSON...');
              const rawMessageString = JSON.stringify(message);
              const rawMessageBytes = new TextEncoder().encode(rawMessageString);
              ok = nacl.sign.detached.verify(rawMessageBytes, signatureBytes, publicKeyBytes);
              
              if (ok) {
                this.logger.log('Raw message JSON verification successful');
              }
            }
          }
          
          if (ok) {
            this.logger.log('Solana signature verification successful');
          } else {
            this.logger.warn('All Solana signature verification methods failed');
          }
          return ok;
        } catch (e) {
          this.logger.warn(`Solana signature verification error: ${(e as Error).message}`);
          return false;
        }
      }

      // Unknown chain
      this.logger.warn(`Signature verification for chain ${input.chainId} is not implemented`);
      return false;
    } catch (error) {
      this.logger.error(`Error verifying signature: ${error.message}`, error.stack);
      return false;
    }
  }

  private buildSiweStyleMessage(message: SIWXMessage, address: string): string {
    // Build an EIP-4361-like message string from SIWXMessage
    const lines: string[] = [];
    if (message.domain) {
      lines.push(`${message.domain} wants you to sign in with your web3 wallet:`);
    } else {
      lines.push('Sign in with your web3 wallet:');
    }
    // Use the validated address argument, not message.address
    lines.push(address);
    lines.push('');
    if (message.statement) {
      lines.push(message.statement);
      lines.push('');
    }
    if (message.uri) lines.push(`URI: ${message.uri}`);
    if (message.version) lines.push(`Version: ${message.version}`);
    if (message.chainId) lines.push(`Chain ID: ${message.chainId}`);
    if (message.nonce) lines.push(`Nonce: ${message.nonce}`);
    if (message.issuedAt) lines.push(`Issued At: ${message.issuedAt}`);
    if (message.expirationTime) lines.push(`Expiration Time: ${message.expirationTime}`);
    return lines.join('\n');
  }

  async reconstructFromSignature(signature: string): Promise<ReconstructedData> {
    // Handle mock signature reconstruction used in tests/dev
    if (signature.startsWith('mock_signature_')) {
      const parts = signature.split('_');
      const nonce = parts.length >= 3 ? parts[2] : 'unknown';
      const address = parts.length >= 4 ? parts[3] : 'unknown';
      const chainId = 'solana:mainnet'; // default for tests when not derivable

      const message: SIWXMessage = {
        domain: 'defi-markets.com',
        address: address,
        statement: 'Sign in to access the DeFi Markets platform',
        uri: 'https://defi-markets.com',
        version: '1',
        chainId: chainId,
        nonce: nonce,
        issuedAt: new Date().toISOString(),
        expirationTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      return { message, address, chainId };
    }

    // For non-mock signatures, return a conservative placeholder so callers can
    // fail verification gracefully without throwing 500s in production.
    this.logger.warn('Reconstruction for non-mock signatures not implemented; returning placeholder data');
    const address = 'unknown';
    const chainId = 'unknown';
    const message: SIWXMessage = {
      domain: 'defi-markets.com',
      address,
      statement: 'Sign in to access the DeFi Markets platform',
      uri: 'https://defi-markets.com',
      version: '1',
      chainId,
      nonce: 'unknown',
      issuedAt: new Date().toISOString(),
      expirationTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    return { message, address, chainId };
  }
}


