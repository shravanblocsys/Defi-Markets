import { 
  Controller, 
  Post, 
  Req, 
  Headers, 
  UnauthorizedException, 
  BadRequestException,
  Logger
} from '@nestjs/common';
import { HeliusStreamService, HeliusWebhookData, EventProcessingResult } from './helius-stream.service';

@Controller('helius-stream')
export class HeliusController {
  private readonly logger = new Logger(HeliusController.name);
  
  constructor(
    private readonly heliusStreamService: HeliusStreamService,
  ) {
    this.logger.log('HeliusController initialized - Vault Creation Events Only');
  }

  @Post('webhook')
  async handleWebhook(
    @Req() req: any, 
    @Headers('x-signature') signature: string,
    @Headers('x-webhook-auth') webhookAuth: string,
    @Headers('authorization') authorization: string,
  ) {
    try {
      const { body } = req;

      // Log webhook receipt
      this.logger.log('🔔 ===== HELIUS VAULT WEBHOOK RECEIVED =====');
      this.logger.log('🔔 Webhook body:', JSON.stringify(body, null, 2));

      // Check for signature in various possible header names
      let authHeader = signature || webhookAuth || authorization;
      
      // Remove 'Bearer ' prefix if present
      if (authHeader && authHeader.startsWith('Bearer ')) {
        authHeader = authHeader.substring(7);
      }

      // Verify webhook signature
      if (!authHeader) {
        this.logger.log('❌ No authentication header found');
        throw new UnauthorizedException('Authentication header not provided');
      }

      try {
        this.heliusStreamService.verifyWebhookSignature(body, authHeader);
        this.logger.log('✅ Signature verification successful');
      } catch (signatureError) {
        this.logger.log('❌ Signature verification failed:', signatureError.message);
        throw new UnauthorizedException('Invalid signature');
      }

      // Process webhook data
      const webhookDataArray: HeliusWebhookData[] = Array.isArray(body) ? body : [body];
      const results: EventProcessingResult[] = [];

      // Process each webhook event
      for (const webhookData of webhookDataArray) {
        this.logger.log(`🔔 Processing webhook event: ${webhookData.type}`);
        const result = await this.heliusStreamService.processWebhookData(webhookData);
        results.push(result);
      }

      // Check if all events were processed successfully
      const allSuccessful = results.every((result) => result.success);

      if (allSuccessful) {
        this.logger.log('✅ All vault webhook events processed successfully');
        return {
          status: true,
          message: 'All Helius vault webhook events processed successfully',
          data: results,
        };
      } else {
        this.logger.log('⚠️ Some vault webhook events failed to process');
        throw new BadRequestException({
          status: false,
          message: 'Some Helius vault webhook events failed to process',
          data: results,
        });
      }
    } catch (error: any) {
      this.logger.error('❌ Error processing Helius vault webhook:', error);
      
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException({
        status: false,
        message: 'Internal server error',
        error: error.message,
      });
    }
  }
}


