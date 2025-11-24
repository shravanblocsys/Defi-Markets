import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { SolanaTokenService } from './solana-token.service';
import { SolanaTokenController } from './solana-token.controller';
import { AssetAllocationModule } from '../asset-allocation/asset-allocation.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10000, // 10 seconds timeout
      maxRedirects: 3,
      headers: {
        'User-Agent': 'DeFi-Markets-BE/1.0',
      },
    }),
    ConfigModule,
    AssetAllocationModule
  ],
  providers: [SolanaTokenService],
  controllers: [SolanaTokenController],
  exports: [SolanaTokenService],
})
export class SolanaTokenModule {}
