import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from "@nestjs/common";
import { UpdateFeesDto } from "./dto/update-fees.dto";
import { RateLimitGuard } from "../../middlewares";
import { ReadTransactionDto } from "./dto/read-transaction.dto";
import { UpdateVaultRedeemDto } from "./dto/update-vault-redeem.dto";
import { UpdateVaultDepositDto } from "./dto/update-vault-deposit.dto";
import { TxEventManagementService } from "./tx-event-management.service";
import { SwapDto } from "./dto/swap.dto";
import { RedeemSwapAdminDto } from "./dto/redeem-swap-admin.dto";
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from "@nestjs/swagger";
import { AuthenticatedRequest } from "../../utils/utils";
import { AuthGuard } from "@nestjs/passport";

@ApiTags("Transaction Event Management")
@Controller("api/v1/tx-event-management")
export class TxEventManagementController {
  constructor(
    private readonly txEventManagementService: TxEventManagementService
  ) {}

  // added rate limiting for all the endpoints in this controller
  @Post("read-transaction")
  @UseGuards(RateLimitGuard)
  @ApiOperation({ summary: "Read and parse a Solana transaction" })
  @ApiResponse({
    status: 200,
    description: "Transaction data parsed successfully",
  })
  async readTransaction(
    @Body() readTransactionDto: ReadTransactionDto
  ): Promise<any> {
    return this.txEventManagementService.readTransaction(readTransactionDto);
  }

  @Post("update-fees")
  @UseGuards(RateLimitGuard)
  @ApiOperation({ summary: "Update fees from transaction signature" })
  @ApiResponse({ status: 200, description: "Fees updated successfully" })
  async updateFees(@Body() updateFeesDto: UpdateFeesDto): Promise<any> {
    return this.txEventManagementService.updateFees(updateFeesDto);
  }

  @Post("deposit-transaction")
  @UseGuards(RateLimitGuard)
  @ApiOperation({
    summary: "Process deposit transaction and update vault state",
  })
  @ApiResponse({
    status: 200,
    description: "Deposit transaction processed successfully",
  })
  async depositTransaction(
    @Body() depositTransactionDto: UpdateVaultDepositDto
  ): Promise<any> {
    return this.txEventManagementService.depositTransaction(
      depositTransactionDto
    );
  }

  @Post("redeem-transaction")
  @UseGuards(RateLimitGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Process redeem transaction and update vault state",
  })
  @ApiResponse({
    status: 200,
    description: "Redeem transaction processed successfully",
  })
  async redeemTransaction(
    @Body() redeemTransactionDto: UpdateVaultRedeemDto,
    @Req() req: AuthenticatedRequest
  ): Promise<any> {
    const user = req.raw.user;
    return this.txEventManagementService.redeemTransaction({
      ...redeemTransactionDto,
      performedByProfileId: user?._id,
      performedByWallet: user?.walletAddress,
    } as any);
  }

  @Post("swap")
  @UseGuards(RateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Execute admin swap for a vault via Jupiter" })
  @ApiBody({ type: SwapDto })
  @ApiResponse({ status: 200, description: "Swap executed successfully" })
  async swap(@Body() dto: SwapDto): Promise<any> {
    return this.txEventManagementService.swap(dto);
  }

  @Post("redeem-swap")
  @UseGuards(RateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Execute admin redeem swaps (underlying->USDC to vault PDA)" })
  @ApiBody({ type: RedeemSwapAdminDto })
  @ApiResponse({ status: 200, description: "Redeem swaps executed successfully" })
  async redeemSwap(@Body() dto: RedeemSwapAdminDto): Promise<any> {
    console.log("dto", dto);
    return this.txEventManagementService.redeemSwapAdmin(dto);
  }
}
