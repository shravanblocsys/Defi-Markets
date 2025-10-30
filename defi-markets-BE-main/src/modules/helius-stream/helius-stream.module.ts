import { Module } from '@nestjs/common';
import { HeliusStreamService } from './helius-stream.service';
import { HeliusController } from './helius.controller';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [ConfigModule],
  providers: [HeliusStreamService],
  controllers: [HeliusController],
  exports: [HeliusStreamService],
})
export class HeliusStreamModule {}
