import {
  Controller,
  Get,
  Param,
  Req,
  Query,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { HistoryService } from "./history.service";
import { HistoryQueryDto } from "./dto/history-query.dto";
import { UsePagination } from "../../middlewares/pagination/pagination.decorator";
import { PaginationHelper } from "../../middlewares/pagination/paginationHelper";
import { AdminGuard } from "../../middlewares";
import { CacheInterceptor, CacheKey, CacheTTL } from "../../utils/redis";

@Controller("api/v1/history")
export class HistoryController {
  constructor(
    private readonly historyService: HistoryService,
    private readonly paginationHelper: PaginationHelper
  ) {}

  @Get()
  @UsePagination()
  @UseGuards(AdminGuard)
  findAll(@Req() req: any, @Query() query: HistoryQueryDto) {
    const paginationQuery = this.paginationHelper.createPaginationQuery(req);
    return this.historyService.findAll(paginationQuery, query);
  }

  @Get("export")
  @UseGuards(AdminGuard)
  export(@Query() query: HistoryQueryDto) {
    return this.historyService.export(query);
  }

  // Vault History APIs
  @Get("vaults")
  @UsePagination()
  @UseGuards(AdminGuard)
  findVaultHistory(@Req() req: any, @Query() query: HistoryQueryDto) {
    const paginationQuery = this.paginationHelper.createPaginationQuery(req);
    return this.historyService.findVaultHistory(paginationQuery, query);
  }

  @Get("vaults/export")
  @UseGuards(AdminGuard)
  exportVaultHistory(@Query() query: HistoryQueryDto) {
    return this.historyService.exportVaultHistory(query);
  }

  @Get("vaults/:vaultId")
  @UseGuards(AdminGuard)
  findVaultHistoryById(@Param("vaultId") vaultId: string) {
    return this.historyService.findByVault(vaultId);
  }

  // Wallet History APIs
  @Get("wallets")
  @UsePagination()
  @UseGuards(AdminGuard)
  findWalletHistory(@Req() req: any, @Query() query: HistoryQueryDto) {
    const paginationQuery = this.paginationHelper.createPaginationQuery(req);
    return this.historyService.findWalletHistory(paginationQuery, query);
  }

  @Get("wallets/export")
  @UseGuards(AdminGuard)
  exportWalletHistory(@Query() query: HistoryQueryDto) {
    return this.historyService.exportWalletHistory(query);
  }

  @Get("wallets/:walletId")
  @UseGuards(AdminGuard)
  findWalletHistoryById(@Param("walletId") walletId: string) {
    return this.historyService.findByWallet(walletId);
  }

  // Fee History APIs
  @Get("fees")
  @UsePagination()
  @UseGuards(AdminGuard)
  findFeeHistory(@Req() req: any, @Query() query: HistoryQueryDto) {
    const paginationQuery = this.paginationHelper.createPaginationQuery(req);
    return this.historyService.findFeeHistory(paginationQuery, query);
  }

  @Get("fees/export")
  @UseGuards(AdminGuard)
  exportFeeHistory(@Query() query: HistoryQueryDto) {
    return this.historyService.exportFeeHistory(query);
  }

  @Get("fees/:feeId")
  @UseGuards(AdminGuard)
  findFeeHistoryById(@Param("feeId") feeId: string) {
    return this.historyService.findByFee(feeId);
  }

  // Action-based APIs
  @Get("actions/:action")
  @UseGuards(AdminGuard)
  findByAction(@Param("action") action: string) {
    return this.historyService.findByAction(action);
  }

  // User-based APIs
  @Get("users/:profileId")
  @UseGuards(AdminGuard)
  findByPerformedBy(@Param("profileId") profileId: string) {
    return this.historyService.findByPerformedBy(profileId);
  }

  // Transaction History APIs
  @Get("transactions")
  @UsePagination()
  @UseGuards(AdminGuard)
  findTransactionHistoryAdmin(
    @Req() req: any,
    @Query() query: HistoryQueryDto
  ) {
    const paginationQuery = this.paginationHelper.createPaginationQuery(req);
    return this.historyService.findTransactionHistory(paginationQuery, query);
  }

  // Transaction History APIs
  @Get("transactions-user")
  @UsePagination()
  // @UseInterceptors(CacheInterceptor)
  // @CacheKey("history:findTransactionHistory:userAddress")
  // @CacheTTL(300) // Cache for 5 minutes
  findTransactionHistory(@Req() req: any, @Query() query: HistoryQueryDto) {
    const paginationQuery = this.paginationHelper.createPaginationQuery(req);
    return this.historyService.findTransactionHistory(
      paginationQuery,
      query,
      req.raw.user.id
    );
  }

  @Get("transactions/export")
  @UseGuards(AdminGuard)
  exportTransactionHistory(@Query() query: HistoryQueryDto) {
    return this.historyService.exportTransactionHistory(query);
  }

  @Get("transactions/deposits")
  @UsePagination()
  @UseGuards(AdminGuard)
  findDepositHistory(@Req() req: any, @Query() query: HistoryQueryDto) {
    const paginationQuery = this.paginationHelper.createPaginationQuery(req);
    return this.historyService.findDepositHistory(paginationQuery, query);
  }

  @Get("transactions/redeems")
  @UsePagination()
  @UseGuards(AdminGuard)
  findRedeemHistory(@Req() req: any, @Query() query: HistoryQueryDto) {
    const paginationQuery = this.paginationHelper.createPaginationQuery(req);
    return this.historyService.findRedeemHistory(paginationQuery, query);
  }

  @Get("transactions/signature/:transactionSignature")
  @UseGuards(AdminGuard)
  findByTransactionSignature(
    @Param("transactionSignature") transactionSignature: string
  ) {
    return this.historyService.findByTransactionSignature(transactionSignature);
  }

  @Get(":id")
  @UseGuards(AdminGuard)
  findOne(@Param("id") id: string) {
    return this.historyService.findOne(id);
  }
}
