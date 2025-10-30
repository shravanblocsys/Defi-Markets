import { 
  Controller, 
  Post, 
  Get, 
  Delete, 
  Body, 
  Query, 
  Headers, 
  HttpCode, 
  HttpStatus,
  UseGuards,
  BadRequestException,
  UnauthorizedException 
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SiwxService } from './siwx.service';
import { 
  SIWXSessionQueryDto, 
  SIWXRevokeQueryDto,
  SIWXCreateNonceDto,
  SIWXSignatureOnlyVerificationDto,
  SIWXVerificationDto
} from './dto/siwx.dto';
import { 
  SIWXMessage, 
  SIWXVerificationResponse, 
  SIWXSessionResponse, 
  SIWXRevokeResponse 
} from './interfaces/siwx.interface';

@Controller('api/v1/user')
@ApiTags('SIWX Authentication')
export class SiwxController {
  constructor(private readonly siwxService: SiwxService) {}

  /**
   * Creates a unique nonce for SIWX authentication
   */
  @Post('create-nonce')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a unique nonce for SIWX authentication' })
  @ApiResponse({ 
    status: 200, 
    description: 'Nonce created successfully',
    schema: {
      type: 'object',
      properties: {
        nonce: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ 
    status: 400, 
    description: 'Bad Request - Invalid address format',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'address must not be empty' },
      },
    },
  })
  async createNonce(@Body() input: SIWXCreateNonceDto): Promise<{ nonce: string }> {
    try {
      const nonce = await this.siwxService.createNonce(input);
      return { nonce };
    } catch (error) {
      throw new BadRequestException('Failed to create nonce');
    }
  }

  /**
   * Creates a test signature for testing verification
   */
  @Post('create-test-signature')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a test signature for testing verification' })
  @ApiResponse({ 
    status: 200, 
    description: 'Test signature created successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'object' },
        signature: { type: 'string' },
        address: { type: 'string' },
        chainId: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  async createTestSignature(@Body() input: {
    address: string;
    chainId: string;
  }): Promise<{ message: any; signature: string; address: string; chainId: string }> {
    try {
      const result = await this.siwxService.createTestSignature(input);
      return result;
    } catch (error) {
      throw new BadRequestException('Failed to create test signature');
    }
  }

  /**
   * Creates a SIWX message for the user to sign
   */
  @Post('create-message')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a SIWX message for signing' })
  @ApiResponse({ 
    status: 200, 
    description: 'Message created successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'object',
          properties: {
            domain: { type: 'string' },
            address: { type: 'string' },
            statement: { type: 'string' },
            uri: { type: 'string' },
            version: { type: 'string' },
            chainId: { type: 'string' },
            nonce: { type: 'string' },
            issuedAt: { type: 'string' },
            expirationTime: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  async createMessage(@Body() input: {
    domain: string;
    address: string;
    statement: string;
    uri: string;
    version: string;
    chainId: string;
    nonce: string;
  }): Promise<{ message: SIWXMessage }> {
    try {
      const message = await this.siwxService.createMessage(input);
      return { message };
    } catch (error) {
      throw new BadRequestException('Failed to create SIWX message');
    }
  }

  /**
   * Verifies a SIWX signature and creates a session
   * Only the signature is required - the message is reconstructed from the signature
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify SIWX signature and create session (only signature required)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Signature verified successfully',
    schema: {
      type: 'object',
      properties: {
        isValid: { type: 'boolean' },
        session: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            address: { type: 'string' },
            chainId: { type: 'string' },
            message: { type: 'object' },
            issuedAt: { type: 'string' },
            expiresAt: { type: 'string' },
            isValid: { type: 'boolean' },
            token: { type: 'string' },
          },
        },
        error: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid signature' })
  async verifySignature(@Body() request: SIWXSignatureOnlyVerificationDto): Promise<SIWXVerificationResponse> {
    try {
      const result = await this.siwxService.verifyAndCreateSessionFromSignature(request.signature);
      if (!result.isValid) {
        throw new UnauthorizedException(result.error || 'Invalid signature');
      }
      return result;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new BadRequestException('Failed to verify signature');
    }
  }

  /**
   * Verifies a SIWX signature and creates a session (explicit payload: message, signature, address, chainId)
   * Use this for Solana/Phantom and other wallets that don't support reconstruction.
   */
  @Post('verify-payload')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify SIWX signature and create session (full payload)' })
  async verifySignatureWithPayload(@Body() request: SIWXVerificationDto): Promise<SIWXVerificationResponse> {
    try {
      const result = await this.siwxService.verifyAndCreateSession({
        message: request.message as any,
        signature: request.signature,
        chainId: request.chainId,
      });
      if (!result.isValid) {
        throw new UnauthorizedException(result.error || 'Invalid signature');
      }
      return result;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new BadRequestException('Failed to verify signature');
    }
  }

  /**
   * Gets all valid sessions for a specific chain and address
   */
  @Get('sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all valid sessions for a chain and address' })
  @ApiResponse({ 
    status: 200, 
    description: 'Sessions retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        sessions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              address: { type: 'string' },
              chainId: { type: 'string' },
              message: { type: 'object' },
              issuedAt: { type: 'string' },
              expiresAt: { type: 'string' },
              isValid: { type: 'boolean' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  async getSessions(@Query() query: SIWXSessionQueryDto): Promise<SIWXSessionResponse> {
    try {
      return await this.siwxService.getSessions(query.chainId, query.address);
    } catch (error) {
      throw new BadRequestException('Failed to get sessions');
    }
  }

  /**
   * Revokes all sessions for a specific chain and address
   */
  @Delete('sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke all sessions for a chain and address' })
  @ApiResponse({ 
    status: 200, 
    description: 'Sessions revoked successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  async revokeSessions(@Query() query: SIWXRevokeQueryDto): Promise<SIWXRevokeResponse> {
    try {
      return await this.siwxService.revokeSessions(query.chainId, query.address);
    } catch (error) {
      throw new BadRequestException('Failed to revoke sessions');
    }
  }

  /**
   * Validates a session token
   */
  @Get('validate-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate a session token' })
  @ApiBearerAuth()
  @ApiResponse({ 
    status: 200, 
    description: 'Token validated successfully',
    schema: {
      type: 'object',
      properties: {
        isValid: { type: 'boolean' },
        session: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            address: { type: 'string' },
            chainId: { type: 'string' },
            message: { type: 'object' },
            signature: { type: 'string' },
            issuedAt: { type: 'string' },
            expiresAt: { type: 'string' },
            isValid: { type: 'boolean' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid token' })
  async validateToken(@Headers('authorization') authHeader: string): Promise<{ isValid: boolean; session?: any }> {
    try {
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException('Invalid authorization header');
      }

      const token = authHeader.substring(7);
      const session = await this.siwxService.validateSessionToken(token);
      
      return {
        isValid: true,
        session,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid session token');
    }
  }

  /**
   * Gets storage statistics (admin endpoint)
   */
  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get SIWX storage statistics' })
  @ApiResponse({ 
    status: 200, 
    description: 'Statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        totalSessions: { type: 'number' },
        totalAddresses: { type: 'number' },
      },
    },
  })
  async getStats(): Promise<{ totalSessions: number; totalAddresses: number }> {
    try {
      return this.siwxService.getStorageStats();
    } catch (error) {
      throw new BadRequestException('Failed to get statistics');
    }
  }

  /**
   * Cleans up expired sessions (admin endpoint)
   */
  @Post('cleanup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clean up expired sessions' })
  @ApiResponse({ 
    status: 200, 
    description: 'Cleanup completed successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  async cleanupExpiredSessions(): Promise<{ message: string }> {
    try {
      await this.siwxService.cleanupExpiredSessions();
      return { message: 'Expired sessions cleaned up successfully' };
    } catch (error) {
      throw new BadRequestException('Failed to cleanup expired sessions');
    }
  }
}
