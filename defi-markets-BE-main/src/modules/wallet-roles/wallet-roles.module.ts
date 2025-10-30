import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WalletRolesService } from './wallet-roles.service';
import { WalletRolesController } from './wallet-roles.controller';
import { WalletRole, WalletRoleSchema } from './entities/wallet-role.entity';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WalletRole.name, schema: WalletRoleSchema },
    ]),
  ],
  controllers: [WalletRolesController],
  providers: [WalletRolesService],
  exports: [WalletRolesService],
})
export class WalletRolesModule {}
