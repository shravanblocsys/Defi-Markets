import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import * as mongoose from "mongoose";
import { CreateVaultDepositDto } from "./dto/create-vault-deposit.dto";
import { UpdateVaultDepositDto } from "./dto/update-vault-deposit.dto";
import {
  CreateDepositTransactionDto,
  CreateRedeemTransactionDto,
  UpdateTransactionStatusDto,
  CreateEmergencyWithdrawDto,
  CreateVaultClosureDto,
} from "./dto/deposit-transaction.dto";
import {
  VaultDeposit,
  DepositTransaction,
  RedeemTransaction,
  EmergencyWithdrawTransaction,
  VaultClosureTransaction,
} from "./entities/vault-deposit.entity";
import {
  FeeConfig,
  VaultState,
  AllocationTarget,
} from "./interfaces/vault-deposit.interface";
import { ProfileService } from "../profile/profile.service";
import { VaultFactoryService } from "../vault-factory/vault-factory.service";
import { FeesManagementService } from "../fees-management/fees-management.service";
import { ConfigService } from "../config/config.service";
import { toBase10Decimal } from "../../utils/utils";
import { RedisService } from "../../utils/redis";
import { CronJobService } from "../cron-job/cron-job.service";

@Injectable()
export class VaultDepositService {
  private readonly logger = new Logger(VaultDepositService.name);

  constructor(
    @InjectModel(VaultDeposit.name)
    private vaultDepositModel: Model<VaultDeposit>,
    @InjectModel(DepositTransaction.name)
    private depositTransactionModel: Model<DepositTransaction>,
    @InjectModel(RedeemTransaction.name)
    private redeemTransactionModel: Model<RedeemTransaction>,
    @InjectModel(EmergencyWithdrawTransaction.name)
    private emergencyWithdrawTransactionModel: Model<EmergencyWithdrawTransaction>,
    @InjectModel(VaultClosureTransaction.name)
    private vaultClosureTransactionModel: Model<VaultClosureTransaction>,
    private readonly profileService: ProfileService,
    @Inject(forwardRef(() => VaultFactoryService))
    private readonly vaultFactoryService: VaultFactoryService,
    private readonly feesManagementService: FeesManagementService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    @Inject(forwardRef(() => CronJobService))
    private readonly cronJobService: CronJobService
  ) {}

  async findAll(): Promise<VaultDeposit[]> {
    return this.vaultDepositModel.find().populate("vaultFactory").exec();
  }

  async findOne(id: string): Promise<VaultDeposit> {
    const vault = await this.vaultDepositModel
      .findById(id)
      .populate("vaultFactory")
      .exec();
    if (!vault) {
      throw new NotFoundException(`Vault with ID ${id} not found`);
    }
    return vault;
  }

  async findByAddress(vaultAddress: string): Promise<VaultDeposit> {
    const vault = await this.vaultDepositModel
      .findOne({ vaultAddress })
      .populate("vaultFactory")
      .exec();
    if (!vault) {
      throw new NotFoundException(
        `Vault with address ${vaultAddress} not found`
      );
    }
    return vault;
  }

  async findByVaultFactory(vaultFactoryId: string): Promise<VaultDeposit[]> {
    return this.vaultDepositModel
      .find({ vaultFactory: vaultFactoryId })
      .populate("vaultFactory")
      .exec();
  }

  async update(
    id: string,
    updateVaultDepositDto: UpdateVaultDepositDto
  ): Promise<VaultDeposit> {
    const updatedVault = await this.vaultDepositModel
      .findByIdAndUpdate(id, updateVaultDepositDto, { new: true })
      .populate("vaultFactory")
      .exec();

    if (!updatedVault) {
      throw new NotFoundException(`Vault with ID ${id} not found`);
    }

    return updatedVault;
  }

  async remove(id: string): Promise<void> {
    const result = await this.vaultDepositModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Vault with ID ${id} not found`);
    }
    // Vault removed successfully
  }

  // Transaction Queries
  async getDepositTransactions(
    vaultAddress?: string,
    userAddress?: string
  ): Promise<DepositTransaction[]> {
    const filter: any = {};
    if (vaultAddress) filter.vaultAddress = vaultAddress;
    if (userAddress) filter.userAddress = userAddress;

    return this.depositTransactionModel
      .find(filter)
      .populate("vaultDeposit")
      .populate({
        path: "vaultFactory",
        populate: {
          path: "underlyingAssets.assetAllocation",
        },
      })
      .populate({
        path: "userProfile",
        select: "username name avatar socialLinks",
      })
      .sort({ timestamp: -1 })
      .exec();
  }

  // Holdings Queries
  async getHoldings(
    vaultAddress?: string,
    userAddress?: string,
    userId?: string
  ): Promise<DepositTransaction[]> {
    const filter: any = {};
    if (vaultAddress) filter.vaultAddress = vaultAddress;
    if (userAddress) filter.userAddress = userAddress;
    if (userId) filter.userProfile = userId;

    this.logger.debug("Getting holdings with filter:", filter);

    const holdings = await this.depositTransactionModel
      .find(filter)
      // .populate('vaultDeposit')
      .populate({
        path: "vaultFactory",
        select: "vaultName vaultSymbol",
      })
      .populate({
        path: "userProfile",
        select: "username name avatar socialLinks",
      })
      .sort({ timestamp: -1 })
      .exec();

    this.logger.debug(`Found ${holdings.length} holdings`);
    return holdings;
  }

  async getRedeemTransactions(
    vaultAddress?: string,
    userAddress?: string
  ): Promise<RedeemTransaction[]> {
    const filter: any = {};
    if (vaultAddress) filter.vaultAddress = vaultAddress;
    if (userAddress) filter.userAddress = userAddress;

    return this.redeemTransactionModel
      .find(filter)
      .populate("vaultDeposit")
      .populate({
        path: "vaultFactory",
        select: "vaultName vaultSymbol",
      })
      .populate({
        path: "userProfile",
        select: "username name avatar socialLinks",
      })
      .sort({ timestamp: -1 })
      .exec();
  }

  async getEmergencyWithdrawTransactions(
    vaultAddress?: string,
    guardianAddress?: string
  ): Promise<EmergencyWithdrawTransaction[]> {
    const filter: any = {};
    if (vaultAddress) filter.vaultAddress = vaultAddress;
    if (guardianAddress) filter.guardianAddress = guardianAddress;

    return this.emergencyWithdrawTransactionModel
      .find(filter)
      .populate("vaultDeposit")
      .populate({
        path: "vaultFactory",
        select: "vaultName vaultSymbol",
      })
      .populate({
        path: "guardianProfile",
        select: "username name avatar socialLinks",
      })
      .sort({ timestamp: -1 })
      .exec();
  }

  /**
   * Get Total Value Locked (TVL) for a specific vault by summing current user holdings
   * @param vaultAddress - The vault address
   * @returns TVL converted to base-10 decimal (6 decimals)
   */
  async getTotalValueLockedByVaultAddress(
    vaultAddress: string
  ): Promise<number> {
    if (!vaultAddress) {
      throw new BadRequestException("vaultAddress is required");
    }

    const result = await this.depositTransactionModel
      .aggregate([
        { $match: { vaultAddress, status: "completed" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .exec();

    const rawTotal = result.length > 0 ? result[0].total : 0;
    return toBase10Decimal(Number(rawTotal));
  }

  /**
   * Get Net TVL for a vault as Deposits - Redeems (completed only)
   * Returns base-10 decimal USD
   */
  async getNetValueLockedByVaultAddress(vaultAddress: string): Promise<number> {
    if (!vaultAddress) {
      throw new BadRequestException("vaultAddress is required");
    }

    const [depositAgg, redeemAgg] = await Promise.all([
      this.depositTransactionModel
        .aggregate([
          { $match: { vaultAddress, status: "completed" } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ])
        .exec(),
      this.redeemTransactionModel
        .aggregate([
          { $match: { vaultAddress, status: "completed" } },
          { $group: { _id: null, total: { $sum: "$tokensReceived" } } },
        ])
        .exec(),
    ]);

    const totalDeposits = depositAgg.length > 0 ? Number(depositAgg[0].total) : 0;
    const totalRedeems = redeemAgg.length > 0 ? Number(redeemAgg[0].total) : 0;
    const netUsd = Math.max(0, totalDeposits - totalRedeems);
    return toBase10Decimal(netUsd);
  }

  async getVaultClosureTransactions(
    vaultAddress?: string,
    adminAddress?: string
  ): Promise<VaultClosureTransaction[]> {
    const filter: any = {};
    if (vaultAddress) filter.vaultAddress = vaultAddress;
    if (adminAddress) filter.adminAddress = adminAddress;

    return this.vaultClosureTransactionModel
      .find(filter)
      .populate("vaultDeposit")
      .populate({
        path: "vaultFactory",
        select: "vaultName vaultSymbol",
      })
      .populate({
        path: "adminProfile",
        select: "username name avatar socialLinks",
      })
      .sort({ timestamp: -1 })
      .exec();
  }

  /**
   * Get total count of all vault deposits
   */
  async count(): Promise<number> {
    return this.vaultDepositModel.countDocuments().exec();
  }

  /**
   * Get count of transactions by status
   * @param status - The status to count
   */
  async countByStatus(
    status: "pending" | "completed" | "failed"
  ): Promise<number> {
    const [depositCount, redeemCount] = await Promise.all([
      this.depositTransactionModel.countDocuments({ status }).exec(),
      this.redeemTransactionModel.countDocuments({ status }).exec(),
    ]);
    return depositCount + redeemCount;
  }

  /**
   * Get total count of completed deposit transactions
   */
  async countCompletedDeposits(): Promise<number> {
    return this.depositTransactionModel
      .countDocuments({ status: "completed" })
      .exec();
  }

  /**
   * Get total count of completed redeem transactions
   */
  async countCompletedRedeems(): Promise<number> {
    return this.redeemTransactionModel
      .countDocuments({ status: "completed" })
      .exec();
  }

  /**
   * Get count of unique users who have made deposits
   * @returns Promise<number> - Count of unique users with deposits
   */
  async countUniqueUsersWithDeposits(): Promise<number> {
    const uniqueUsers = await this.depositTransactionModel
      .distinct("userProfile", { status: "completed" })
      .exec();
    return uniqueUsers.length;
  }

  /**
   * Get count of unique users who have redeemed
   * @returns Promise<number> - Count of unique users with redeems
   */
  async countUniqueUsersWithRedeems(): Promise<number> {
    const uniqueUsers = await this.redeemTransactionModel
      .distinct("userProfile", { status: "completed" })
      .exec();
    return uniqueUsers.length;
  }

  /**
   * Get count of unique users who have deposited into a specific vault
   * @param vaultAddress - The vault address to count users for
   * @returns Promise<number> - Count of unique users with deposits for the vault
   */
  async countUniqueUsersWithDepositsForVault(
    vaultAddress: string
  ): Promise<number> {
    const uniqueUsers = await this.depositTransactionModel
      .distinct("userProfile", {
        vaultAddress,
        status: "completed",
      })
      .exec();
    return uniqueUsers.length;
  }

  /**
   * Get total deposit amount in USD (sum of all completed deposits)
   * @returns Promise<number> - Total deposit amount
   */
  async getTotalDepositAmount(): Promise<number> {
    const result = await this.depositTransactionModel
      .aggregate([
        { $match: { status: "completed" } },
        { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
      ])
      .exec();

    return result.length > 0 ? result[0].totalAmount : 0;
  }

  /**
   * Get total redeem amount in USD (sum of all completed redeems)
   * Uses tokensReceived field which represents net stablecoin amount paid out
   * @returns Promise<number> - Total redeemed amount
   */
  async getTotalRedeemAmount(): Promise<number> {
    const result = await this.redeemTransactionModel
      .aggregate([
        { $match: { status: "completed" } },
        { $group: { _id: null, totalAmount: { $sum: "$tokensReceived" } } },
      ])
      .exec();

    return result.length > 0 ? result[0].totalAmount : 0;
  }

  /**
   * Get total redeem amount from last month
   * @returns Promise<number> - Last month's total redeem amount
   */
  async getTotalRedeemAmountLastMonth(): Promise<number> {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    lastMonth.setDate(1);
    lastMonth.setHours(0, 0, 0, 0);

    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const result = await this.redeemTransactionModel
      .aggregate([
        {
          $match: {
            status: "completed",
            timestamp: {
              $gte: lastMonth,
              $lt: thisMonth,
            },
          },
        },
        { $group: { _id: null, totalAmount: { $sum: "$tokensReceived" } } },
      ])
      .exec();

    return result.length > 0 ? result[0].totalAmount : 0;
  }

  /**
   * Get total deposit amount from last month
   * @returns Promise<number> - Last month's total deposit amount
   */
  async getTotalDepositAmountLastMonth(): Promise<number> {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    lastMonth.setDate(1);
    lastMonth.setHours(0, 0, 0, 0);

    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const result = await this.depositTransactionModel
      .aggregate([
        {
          $match: {
            status: "completed",
            timestamp: {
              $gte: lastMonth,
              $lt: thisMonth,
            },
          },
        },
        { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
      ])
      .exec();

    return result.length > 0 ? result[0].totalAmount : 0;
  }

  /**
   * Get current fee configuration from fees management service
   * @returns Promise<FeeConfig> - Current fee configuration
   */
  private async getCurrentFeeConfig(): Promise<FeeConfig> {
    try {
      const currentFees =
        await this.feesManagementService.getCurrentActiveFeeConfig();

      // Extract fee values from the fees array
      let entryFee = 0;
      let exitFee = 0;
      let performanceFee = 0;
      let protocolFee = 0;

      for (const fee of currentFees.fees) {
        switch (fee.type) {
          case "entry_fee":
            entryFee = fee.feeRate || 0;
            break;
          case "exit_fee":
            exitFee = fee.feeRate || 0;
            break;
          case "management":
            // For management fees, use the minimum rate as the base performance fee
            performanceFee = fee.minFeeRate || 0;
            break;
          case "vault_creation_fee":
            // Vault creation fee is typically a one-time fee, not a recurring protocol fee
            // We'll set it as protocol fee for now, but this might need adjustment based on business logic
            protocolFee = fee.feeRate || 0;
            break;
        }
      }

      return {
        entryFee,
        exitFee,
        performanceFee,
        protocolFee,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to get current fee configuration: ${error.message}. Using default values.`
      );
      // Return default fee configuration if unable to fetch current fees
      return {
        entryFee: 0,
        exitFee: 0,
        performanceFee: 0,
        protocolFee: 0,
      };
    }
  }

  /**
   * Get active users count from yesterday
   * @returns Promise<number> - Yesterday's active users count
   */
  async getActiveUsersYesterday(): Promise<number> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [depositUsers, redeemUsers] = await Promise.all([
      this.depositTransactionModel
        .distinct("userProfile", {
          status: "completed",
          timestamp: { $gte: yesterday, $lt: today },
        })
        .exec(),
      this.redeemTransactionModel
        .distinct("userProfile", {
          status: "completed",
          timestamp: { $gte: yesterday, $lt: today },
        })
        .exec(),
    ]);

    // Combine unique users from both deposits and redeems
    const uniqueUsers = new Set([...depositUsers, ...redeemUsers]);
    return uniqueUsers.size;
  }

  /**
   * Update vault deposit from blockchain event data
   * @param event - The structured event data from VaultDeposited
   * @param updatedBy - User wallet address who performed the deposit
   * @param vault - Vault address
   * @param transactionSignature - Optional transaction signature
   * @param blockNumber - Optional block number
   * @returns Promise<any> - Updated vault deposit and transaction data
   */
  async updateVaultDepositFromEvent(
    event: any,
    updatedBy: string,
    vault: string,
    transactionSignature?: string,
    blockNumber?: number
  ): Promise<any> {
    try {
      const transactionExists = await this.depositTransactionModel.findOne({
        transactionSignature: transactionSignature,
      });

      if (transactionExists) {
        throw new Error(`Transaction already exists: ${transactionSignature}`);
      }

      // Find the vault factory record
      const vaultFactory = await this.vaultFactoryService.findByAddress(vault);

      if (!vaultFactory) {
        throw new Error(`Vault factory not found for address: ${vault}`);
      }

      // Find the user profile
      const userProfile = await this.profileService.getByWalletAddress(
        updatedBy
      );

      if (!userProfile) {
        throw new Error(`User profile not found for address: ${updatedBy}`);
      }

      // Find or create the VaultDeposit record (vault configuration)
      let vaultDeposit = await this.vaultDepositModel.findOne({
        vaultAddress: vault,
      });

      if (!vaultDeposit) {
        // Create new VaultDeposit record if it doesn't exist
        const newVaultDeposit = new this.vaultDepositModel({
          vaultFactory: vaultFactory._id,
          vaultAddress: vault,
          feeConfig: {
            entryFee: event.entryFee || 0,
            exitFee: event.exitFee || 0,
            performanceFee: event.performanceFee || 0,
            protocolFee: event.protocolFee || 0,
          },
          state: {
            status: "Active",
            totalAssets: parseInt(event.total_assets) || 0,
            totalShares: parseInt(event.total_shares) || 0,
            lastUpdated: new Date(),
          },
          admin: vaultFactory.creatorAddress,
          factory: vaultFactory.factoryAddress,
          // etfMint, vaultBaseTreasury, and baseMint are optional and will be undefined
        });

        vaultDeposit = await newVaultDeposit.save();
      } else {
        // Update existing VaultDeposit record with new state (set to new totals from blockchain)
        vaultDeposit.state.totalAssets = parseInt(event.total_assets) || 0;
        vaultDeposit.state.totalShares = parseInt(event.total_shares) || 0;
        vaultDeposit.state.lastUpdated = new Date();

        vaultDeposit = await vaultDeposit.save();
      }

      // Find existing user holding record for this vault
      let userHolding = await this.depositTransactionModel.findOne({
        vaultAddress: vault,
        userProfile: userProfile._id,
      });

      if (userHolding) {
        // Update existing holding record - add to existing amounts
        userHolding.amount += parseInt(event.amount) || 0;
        userHolding.sharesReceived += parseInt(event.shares_minted) || 0;
        userHolding.feePaid += parseInt(event.entry_fee) || 0;
        userHolding.timestamp = new Date(parseInt(event.timestamp) * 1000); // Update to latest timestamp
        userHolding.transactionSignature =
          transactionSignature || userHolding.transactionSignature;
        userHolding.blockNumber = blockNumber || userHolding.blockNumber;

        const savedUserHolding = await userHolding.save();

        return {
          vaultDeposit,
          depositTransaction: savedUserHolding,
          isNewHolding: false,
        };
      } else {
        // Create new user holding record
        const depositTransaction = new this.depositTransactionModel({
          vaultDeposit: vaultDeposit._id,
          vaultFactory: vaultFactory._id,
          vaultAddress: vault,
          userProfile: userProfile._id,
          userAddress: updatedBy,
          amount: parseInt(event.amount) || 0,
          sharesReceived: parseInt(event.shares_minted) || 0,
          feePaid: parseInt(event.entry_fee) || 0,
          timestamp: new Date(parseInt(event.timestamp) * 1000),
          status: "completed",
          transactionSignature: transactionSignature || "",
          blockNumber: blockNumber || 0,
        });

        const savedDepositTransaction = await depositTransaction.save();

        //cache clear
        this.clearVaultDepositCache();

        return {
          vaultDeposit,
          depositTransaction: savedDepositTransaction,
          isNewHolding: true,
        };
      }
    } catch (error) {
      this.logger.error("Error in updateVaultDepositFromEvent:", error);
      throw error;
    }
  }

  /**
   * Update vault redeem from blockchain event data
   * @param event - The structured event data from VaultRedeemed
   * @param updatedBy - User wallet address who performed the redeem
   * @param vault - Vault address
   * @param transactionSignature - Optional transaction signature
   * @param blockNumber - Optional block number
   * @returns Promise<any> - Updated vault deposit and redeem transaction data
   */
  async updateVaultRedeemFromEvent(
    event: any,
    updatedBy: string,
    vault: string,
    transactionSignature?: string,
    blockNumber?: number
  ): Promise<any> {
    this.logger.debug(
      `Processing vault redeem event: ${JSON.stringify(event)}`
    );

    try {
      const transactionExists = await this.redeemTransactionModel.findOne({
        transactionSignature: transactionSignature,
      });

      if (transactionExists) {
        throw new Error(`Transaction already exists: ${transactionSignature}`);
      }

      // Find the vault factory record
      const vaultFactory = await this.vaultFactoryService.findByAddress(vault);

      if (!vaultFactory) {
        throw new Error(`Vault factory not found for address: ${vault}`);
      }

      // Find the user profile
      const userProfile = await this.profileService.getByWalletAddress(
        updatedBy
      );

      if (!userProfile) {
        throw new Error(`User profile not found for address: ${updatedBy}`);
      }

      // Find the VaultDeposit record (vault configuration)
      let vaultDeposit = await this.vaultDepositModel.findOne({
        vaultAddress: vault,
      });

      if (!vaultDeposit) {
        throw new Error(`Vault deposit record not found for address: ${vault}`);
      }

      // Update VaultDeposit record with new state when provided; skip invalid totals
      const nextTotalAssets = parseInt(event.total_assets) || 0;
      const nextTotalShares = parseInt(event.total_shares) || 0;
      if (!Number.isNaN(nextTotalAssets)) {
        vaultDeposit.state.totalAssets = nextTotalAssets;
      }
      if (!Number.isNaN(nextTotalShares)) {
        vaultDeposit.state.totalShares = nextTotalShares;
      }
      vaultDeposit.state.lastUpdated = new Date();
      vaultDeposit = await vaultDeposit.save();

      // Find existing user holding record for this vault
      let userHolding = await this.depositTransactionModel.findOne({
        vaultAddress: vault,
        userProfile: userProfile._id,
      });

      if (userHolding) {
        // Update existing holding record - subtract from existing amounts
        const sharesToRedeem = parseInt(event.shares) || 0;
        const tokensToReceive = parseInt(event.tokens_received) || 0;
        const exitFee = parseInt(event.exit_fee) || 0;

        // Validate parsed values
        if (isNaN(sharesToRedeem) || sharesToRedeem < 0) {
          this.logger.error(
            `Invalid shares value: ${event.shares}, parsed as: ${sharesToRedeem}`
          );
          throw new Error(`Invalid shares value: ${event.shares}`);
        }

        if (isNaN(tokensToReceive) || tokensToReceive < 0) {
          this.logger.error(
            `Invalid tokens_received value: ${event.tokens_received}, parsed as: ${tokensToReceive}`
          );
          throw new Error(
            `Invalid tokens_received value: ${event.tokens_received}`
          );
        }

        if (isNaN(exitFee) || exitFee < 0) {
          this.logger.error(
            `Invalid exit_fee value: ${event.exit_fee}, parsed as: ${exitFee}`
          );
          throw new Error(`Invalid exit_fee value: ${event.exit_fee}`);
        }

        // Check if user has enough shares to redeem
        if (userHolding.sharesReceived < sharesToRedeem) {
          throw new Error(
            `Insufficient shares to redeem. User has ${userHolding.sharesReceived}, trying to redeem ${sharesToRedeem}`
          );
        }

        // Subtract the redeemed amounts
        userHolding.sharesReceived -= sharesToRedeem;
        // Note: amount represents total deposits made, not current balance, so we don't subtract from it
        userHolding.feePaid += exitFee; // Add exit fee to total fees paid
        userHolding.timestamp = new Date(parseInt(event.timestamp) * 1000); // Update to latest timestamp
        userHolding.blockNumber = blockNumber || userHolding.blockNumber;

        const savedUserHolding = await userHolding.save();

        // Create redeem transaction record
        const redeemTransaction = new this.redeemTransactionModel({
          vaultDeposit: vaultDeposit._id,
          vaultFactory: vaultFactory._id,
          vaultAddress: vault,
          userProfile: userProfile._id,
          userAddress: updatedBy,
          shares: sharesToRedeem,
          tokensReceived: tokensToReceive,
          feePaid: exitFee,
          timestamp: new Date(parseInt(event.timestamp) * 1000),
          status: "completed",
          transactionSignature: transactionSignature || "",
          blockNumber: blockNumber || 0,
        });

        const savedRedeemTransaction = await redeemTransaction.save();

        //cache clear
        this.clearVaultDepositCache();

        return {
          vaultDeposit,
          depositTransaction: savedUserHolding,
          redeemTransaction: savedRedeemTransaction,
          isNewHolding: false,
        };
      } else {
        throw new Error(
          `User holding record not found for vault: ${vault} and user: ${updatedBy}`
        );
      }
    } catch (error) {
      this.logger.error("Error in updateVaultRedeemFromEvent:", error);
      throw error;
    }
  }

  /**
   * Check if the provided min deposit value meets the minimum requirement
   * @param minDeposit - The minimum deposit value to validate
   * @returns Object with validation result and message
   */
  async checkMinDeposit(
    minDeposit: number
  ): Promise<{ isValid: boolean; message: string }> {
    try {
      const configMinDeposit = this.configService.get("MINI_DEPOSIT") || "5";
      const requiredMinDeposit = parseFloat(configMinDeposit);
      const isValid = minDeposit >= requiredMinDeposit;

      return {
        isValid,
        message: isValid
          ? `Minimum deposit requirement of $${requiredMinDeposit} USDC met`
          : `Minimum deposit should be at least $${requiredMinDeposit} USDC`,
      };
    } catch (error) {
      this.logger.error("Error checking minimum deposit:", error);
      return {
        isValid: false,
        message: "Error validating minimum deposit requirement",
      };
    }
  }

  /**
   * Check if the provided min redeem value meets the minimum requirement
   * @param minRedeem - The minimum redeem value to validate
   * @returns Object with validation result and message
   */
  async checkMinRedeem(
    minRedeem: number
  ): Promise<{ isValid: boolean; message: string }> {
    try {
      const configMinRedeem = this.configService.get("MINI_REDEEM") || "4";
      const requiredMinRedeem = parseFloat(configMinRedeem);
      const isValid = minRedeem >= requiredMinRedeem;

      return {
        isValid,
        message: isValid
          ? `Minimum redeem requirement of ${requiredMinRedeem} shares met`
          : `Minimum redeem should be at least ${requiredMinRedeem} shares`,
      };
    } catch (error) {
      this.logger.error("Error checking minimum redeem:", error);
      return {
        isValid: false,
        message: "Error validating minimum redeem requirement",
      };
    }
  }

  /**
   * Clear all vault-deposit-related cache entries
   */
  private async clearVaultDepositCache(): Promise<void> {
    try {
      // Clear cache with pattern matching for vault-deposit keys
      const keys = await this.redisService.keys("vault-deposit:*");
      if (keys.length > 0) {
        for (const key of keys) {
          await this.redisService.delDirect(key);
        }
        // Cache cleared successfully
        await this.redisService.delDirect("dashboard:vault-stats");
      } else {
        // No cache entries found to clear
      }
    } catch (error) {
      this.logger.error("❌ Error clearing vault-deposit cache:", error);
    }
  }
}
