import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { CreateHistoryDto } from "./dto/create-history.dto";
import { HistoryQueryDto } from "./dto/history-query.dto";
import { History, HistoryDocument } from "./entities/history.entity";
import {
  PaginationHelper,
  PaginatedResponse,
  PaginationQuery,
} from "../../middlewares/pagination/paginationHelper";

@Injectable()
export class HistoryService {
  private readonly logger = new Logger(HistoryService.name);

  constructor(
    @InjectModel(History.name) private historyModel: Model<HistoryDocument>,
    private readonly paginationHelper: PaginationHelper
  ) {}

  async create(createHistoryDto: CreateHistoryDto): Promise<History> {
    const createdHistory = new this.historyModel({
      ...createHistoryDto,
      performedBy: new Types.ObjectId(createHistoryDto.performedBy),
      ...(createHistoryDto.vaultId && {
        vaultId: new Types.ObjectId(createHistoryDto.vaultId),
      }),
      ...(createHistoryDto.feeId && {
        feeId: new Types.ObjectId(createHistoryDto.feeId),
      }),
      ...(createHistoryDto.walletId && {
        walletId: new Types.ObjectId(createHistoryDto.walletId),
      }),
    });

    const savedHistory = await createdHistory.save();

    return savedHistory;
  }

  async findAll(
    paginationQuery: PaginationQuery,
    query: HistoryQueryDto = {}
  ): Promise<PaginatedResponse<History>> {
    // Build MongoDB filter based on query parameters
    const filter: any = {};

    // Add action filter
    if (query.action) {
      filter.action = query.action;
    }

    // Add relatedEntity filter
    if (query.relatedEntity) {
      filter.relatedEntity = query.relatedEntity;
    }

    // Add description filter (case-insensitive partial match)
    if (query.description && query.description.trim()) {
      filter.description = { $regex: query.description.trim(), $options: "i" };
    }

    // Add performedBy filter
    if (query.performedBy) {
      if (!Types.ObjectId.isValid(query.performedBy)) {
        throw new BadRequestException("Invalid performedBy ID format");
      }
      filter.performedBy = new Types.ObjectId(query.performedBy);
    }

    // Add vaultId filter
    if (query.vaultId) {
      if (!Types.ObjectId.isValid(query.vaultId)) {
        throw new BadRequestException("Invalid vaultId ID format");
      }
      filter.vaultId = new Types.ObjectId(query.vaultId);
    }

    // Add feeId filter
    if (query.feeId) {
      if (!Types.ObjectId.isValid(query.feeId)) {
        throw new BadRequestException("Invalid feeId ID format");
      }
      filter.feeId = new Types.ObjectId(query.feeId);
    }

    // Add walletId filter
    if (query.walletId) {
      if (!Types.ObjectId.isValid(query.walletId)) {
        throw new BadRequestException("Invalid walletId ID format");
      }
      filter.walletId = new Types.ObjectId(query.walletId);
    }

    // Add date range filter
    if (query.fromDate || query.toDate) {
      filter.createdAt = {};

      if (query.fromDate) {
        // Start of the fromDate (00:00:00.000Z)
        const fromDate = new Date(query.fromDate);
        fromDate.setUTCHours(0, 0, 0, 0);
        filter.createdAt.$gte = fromDate;
      }

      if (query.toDate) {
        // End of the toDate (23:59:59.999Z)
        const toDate = new Date(query.toDate);
        toDate.setUTCHours(23, 59, 59, 999);
        filter.createdAt.$lte = toDate;
      }
    }

    // Ensure latest records are shown first (createdAt: -1)
    const sortQuery = {
      ...paginationQuery,
      sort: { ...paginationQuery.sort, createdAt: -1 as 1 | -1 },
    };

    const populateOptions = [
      { path: "performedBy", select: "username email name" },
      { path: "vaultId", select: "vaultName vaultSymbol" },
      { path: "feeId", select: "feeRate effectiveDate" },
      { path: "walletId", select: "address label currency" },
    ];

    return this.paginationHelper.paginate(
      this.historyModel,
      filter,
      sortQuery,
      populateOptions
    );
  }

  async export(query: HistoryQueryDto = {}): Promise<History[]> {
    // Build MongoDB filter based on query parameters
    const filter: any = {};

    // Add action filter
    if (query.action) {
      filter.action = query.action;
    }

    // Add relatedEntity filter
    if (query.relatedEntity) {
      filter.relatedEntity = query.relatedEntity;
    }

    // Add description filter (case-insensitive partial match)
    if (query.description && query.description.trim()) {
      filter.description = { $regex: query.description.trim(), $options: "i" };
    }

    // Add performedBy filter
    if (query.performedBy) {
      if (!Types.ObjectId.isValid(query.performedBy)) {
        throw new BadRequestException("Invalid performedBy ID format");
      }
      filter.performedBy = new Types.ObjectId(query.performedBy);
    }

    // Add vaultId filter
    if (query.vaultId) {
      if (!Types.ObjectId.isValid(query.vaultId)) {
        throw new BadRequestException("Invalid vaultId ID format");
      }
      filter.vaultId = new Types.ObjectId(query.vaultId);
    }

    // Add feeId filter
    if (query.feeId) {
      if (!Types.ObjectId.isValid(query.feeId)) {
        throw new BadRequestException("Invalid feeId ID format");
      }
      filter.feeId = new Types.ObjectId(query.feeId);
    }

    // Add walletId filter
    if (query.walletId) {
      if (!Types.ObjectId.isValid(query.walletId)) {
        throw new BadRequestException("Invalid walletId ID format");
      }
      filter.walletId = new Types.ObjectId(query.walletId);
    }

    // Add date range filter
    if (query.fromDate || query.toDate) {
      filter.createdAt = {};

      if (query.fromDate) {
        // Start of the fromDate (00:00:00.000Z)
        const fromDate = new Date(query.fromDate);
        fromDate.setUTCHours(0, 0, 0, 0);
        filter.createdAt.$gte = fromDate;
      }

      if (query.toDate) {
        // End of the toDate (23:59:59.999Z)
        const toDate = new Date(query.toDate);
        toDate.setUTCHours(23, 59, 59, 999);
        filter.createdAt.$lte = toDate;
      }
    }

    // Ensure latest records are shown first (createdAt: -1)
    const sortQuery = { createdAt: -1 as 1 | -1 };

    const populateOptions = [
      { path: "performedBy", select: "username email name" },
      { path: "vaultId", select: "vaultName vaultSymbol" },
      { path: "feeId", select: "feeRate effectiveDate" },
      { path: "walletId", select: "address label currency" },
    ];

    return this.historyModel
      .find(filter)
      .sort(sortQuery)
      .populate(populateOptions)
      .exec();
  }

  async findOne(id: string): Promise<History> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException("Invalid history ID format");
    }

    const history = await this.historyModel
      .findById(id)
      .populate("performedBy", "username email name")
      .populate("vaultId", "vaultName vaultSymbol")
      .populate("feeId", "feeRate effectiveDate")
      .populate("walletId", "address label currency")
      .exec();

    if (!history) {
      throw new NotFoundException(`History entry with ID ${id} not found`);
    }

    return history;
  }

  async findByAction(action: string): Promise<History[]> {
    return this.historyModel
      .find({ action })
      .populate("performedBy", "username email name")
      .populate("vaultId", "vaultName vaultSymbol")
      .populate("feeId", "feeRate effectiveDate")
      .populate("walletId", "address label currency")
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByPerformedBy(profileId: string): Promise<History[]> {
    if (!Types.ObjectId.isValid(profileId)) {
      throw new BadRequestException("Invalid profile ID format");
    }

    return this.historyModel
      .find({ performedBy: new Types.ObjectId(profileId) })
      .populate("performedBy", "username email name")
      .populate("vaultId", "vaultName vaultSymbol")
      .populate("feeId", "feeRate effectiveDate")
      .populate("walletId", "address label currency")
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByVault(vaultId: string): Promise<History[]> {
    if (!Types.ObjectId.isValid(vaultId)) {
      throw new BadRequestException("Invalid vault ID format");
    }

    return this.historyModel
      .find({ vaultId: new Types.ObjectId(vaultId) })
      .populate("performedBy", "username email name")
      .populate("vaultId", "vaultName vaultSymbol")
      .populate("feeId", "feeRate effectiveDate")
      .populate("walletId", "address label currency")
      .sort({ createdAt: -1 })
      .exec();
  }

  // We don't need update and remove methods for history as it should be immutable

  async findByWallet(walletId: string): Promise<History[]> {
    if (!Types.ObjectId.isValid(walletId)) {
      throw new BadRequestException("Invalid wallet ID format");
    }

    return this.historyModel
      .find({ walletId: new Types.ObjectId(walletId) })
      .populate("performedBy", "username email name")
      .populate("vaultId", "vaultName vaultSymbol")
      .populate("feeId", "feeRate effectiveDate")
      .populate("walletId", "address label currency")
      .sort({ createdAt: -1 })
      .exec();
  }

  // Entity-specific methods with pagination
  async findVaultHistory(
    paginationQuery: PaginationQuery,
    query: HistoryQueryDto = {}
  ): Promise<PaginatedResponse<History>> {
    const filter: any = { relatedEntity: "vault" };

    // Apply additional filters
    this.applyQueryFilters(filter, query);

    const sortQuery = {
      ...paginationQuery,
      sort: { ...paginationQuery.sort, createdAt: -1 as 1 | -1 },
    };

    const populateOptions = [
      { path: "performedBy", select: "username email name" },
      { path: "vaultId", select: "vaultName vaultSymbol" },
    ];

    return this.paginationHelper.paginate(
      this.historyModel,
      filter,
      sortQuery,
      populateOptions
    );
  }

  async findWalletHistory(
    paginationQuery: PaginationQuery,
    query: HistoryQueryDto = {}
  ): Promise<PaginatedResponse<History>> {
    const filter: any = { relatedEntity: "wallet" };

    // Apply additional filters
    this.applyQueryFilters(filter, query);

    const sortQuery = {
      ...paginationQuery,
      sort: { ...paginationQuery.sort, createdAt: -1 as 1 | -1 },
    };

    const populateOptions = [
      { path: "performedBy", select: "username email name" },
      { path: "walletId", select: "address label currency" },
    ];

    return this.paginationHelper.paginate(
      this.historyModel,
      filter,
      sortQuery,
      populateOptions
    );
  }

  async findFeeHistory(
    paginationQuery: PaginationQuery,
    query: HistoryQueryDto = {}
  ): Promise<PaginatedResponse<History>> {
    const filter: any = { relatedEntity: "fee" };

    // Apply additional filters
    this.applyQueryFilters(filter, query);

    const sortQuery = {
      ...paginationQuery,
      sort: { ...paginationQuery.sort, createdAt: -1 as 1 | -1 },
    };

    const populateOptions = [
      { path: "performedBy", select: "username email name" },
      { path: "feeId", select: "fees isActive" },
    ];

    return this.paginationHelper.paginate(
      this.historyModel,
      filter,
      sortQuery,
      populateOptions
    );
  }

  // Export methods for each entity type
  async exportVaultHistory(query: HistoryQueryDto = {}): Promise<History[]> {
    const filter: any = { relatedEntity: "vault" };
    this.applyQueryFilters(filter, query);

    return this.historyModel
      .find(filter)
      .sort({ createdAt: -1 })
      .populate("performedBy", "username email name")
      .populate("vaultId", "vaultName vaultSymbol")
      .exec();
  }

  async exportWalletHistory(query: HistoryQueryDto = {}): Promise<History[]> {
    const filter: any = { relatedEntity: "wallet" };
    this.applyQueryFilters(filter, query);

    return this.historyModel
      .find(filter)
      .sort({ createdAt: -1 })
      .populate("performedBy", "username email name")
      .populate("walletId", "address label currency")
      .exec();
  }

  async exportFeeHistory(query: HistoryQueryDto = {}): Promise<History[]> {
    const filter: any = { relatedEntity: "fee" };
    this.applyQueryFilters(filter, query);

    return this.historyModel
      .find(filter)
      .sort({ createdAt: -1 })
      .populate("performedBy", "username email name")
      .populate("feeId", "fees isActive")
      .exec();
  }

  async findByFee(feeId: string): Promise<History[]> {
    if (!Types.ObjectId.isValid(feeId)) {
      throw new BadRequestException("Invalid fee ID format");
    }
    return this.historyModel
      .find({ feeId: new Types.ObjectId(feeId) })
      .populate("performedBy", "username email name")
      .populate("feeId", "fees isActive")
      .exec();
  }

  async findByTransactionSignature(
    transactionSignature: string
  ): Promise<History[]> {
    return this.historyModel
      .find({ transactionSignature })
      .populate("performedBy", "username email name")
      .populate("vaultId", "vaultName vaultSymbol")
      .sort({ createdAt: -1 })
      .exec();
  }

  // Transaction History Methods
  async findTransactionHistory(
    paginationQuery: PaginationQuery,
    query: HistoryQueryDto = {},
    userId?: string
  ): Promise<PaginatedResponse<History>> {
    const filter: any = { relatedEntity: "transaction" };

    // Apply additional filters
    this.applyQueryFilters(filter, query);

    if (userId) {
      filter.performedBy = new Types.ObjectId(userId);
    }

    const sortQuery = {
      ...paginationQuery,
      sort: { ...paginationQuery.sort, createdAt: -1 as 1 | -1 },
    };

    const populateOptions = [
      { path: "performedBy", select: "username email name" },
      { path: "vaultId", select: "vaultName vaultSymbol" },
    ];

    return this.paginationHelper.paginate(
      this.historyModel,
      filter,
      sortQuery,
      populateOptions
    );
  }

  async exportTransactionHistory(
    query: HistoryQueryDto = {}
  ): Promise<History[]> {
    const filter: any = { relatedEntity: "transaction" };
    this.applyQueryFilters(filter, query);

    return this.historyModel
      .find(filter)
      .sort({ createdAt: -1 })
      .populate("performedBy", "username email name")
      .populate("vaultId", "vaultName vaultSymbol")
      .exec();
  }

  async findDepositHistory(
    paginationQuery: PaginationQuery,
    query: HistoryQueryDto = {}
  ): Promise<PaginatedResponse<History>> {
    const filter: any = {
      relatedEntity: "transaction",
      action: "deposit_completed",
    };

    this.applyQueryFilters(filter, query);

    const sortQuery = {
      ...paginationQuery,
      sort: { ...paginationQuery.sort, createdAt: -1 as 1 | -1 },
    };

    const populateOptions = [
      { path: "performedBy", select: "username email name" },
      { path: "vaultId", select: "vaultName vaultSymbol" },
    ];

    return this.paginationHelper.paginate(
      this.historyModel,
      filter,
      sortQuery,
      populateOptions
    );
  }

  async findRedeemHistory(
    paginationQuery: PaginationQuery,
    query: HistoryQueryDto = {}
  ): Promise<PaginatedResponse<History>> {
    const filter: any = {
      relatedEntity: "transaction",
      action: "redeem_completed",
    };

    this.applyQueryFilters(filter, query);

    const sortQuery = {
      ...paginationQuery,
      sort: { ...paginationQuery.sort, createdAt: -1 as 1 | -1 },
    };

    const populateOptions = [
      { path: "performedBy", select: "username email name" },
      { path: "vaultId", select: "vaultName vaultSymbol" },
    ];

    return this.paginationHelper.paginate(
      this.historyModel,
      filter,
      sortQuery,
      populateOptions
    );
  }

  // Helper method to create transaction history
  async createTransactionHistory(
    action: string,
    description: string,
    performedBy: string,
    vaultId?: string,
    metadata?: Record<string, any>,
    transactionSignature?: string,
    signatureArray?: string[]
  ): Promise<History> {
    const createHistoryDto: CreateHistoryDto = {
      action,
      description,
      performedBy,
      vaultId,
      relatedEntity: "transaction",
      metadata,
      transactionSignature,
      signatureArray,
    };

    return this.create(createHistoryDto);
  }

  // Helper method to apply common query filters
  private applyQueryFilters(filter: any, query: HistoryQueryDto): void {
    // Add action filter
    if (query.action) {
      filter.action = query.action;
    }

    // Add description filter (case-insensitive partial match)
    if (query.description && query.description.trim()) {
      filter.description = { $regex: query.description.trim(), $options: "i" };
    }

    // Add performedBy filter
    if (query.performedBy) {
      if (!Types.ObjectId.isValid(query.performedBy)) {
        throw new BadRequestException("Invalid performedBy ID format");
      }
      filter.performedBy = new Types.ObjectId(query.performedBy);
    }

    // Add specific entity ID filters
    if (query.vaultId) {
      if (!Types.ObjectId.isValid(query.vaultId)) {
        throw new BadRequestException("Invalid vaultId ID format");
      }
      filter.vaultId = new Types.ObjectId(query.vaultId);
    }

    if (query.feeId) {
      if (!Types.ObjectId.isValid(query.feeId)) {
        throw new BadRequestException("Invalid feeId ID format");
      }
      filter.feeId = new Types.ObjectId(query.feeId);
    }

    if (query.walletId) {
      if (!Types.ObjectId.isValid(query.walletId)) {
        throw new BadRequestException("Invalid walletId ID format");
      }
      filter.walletId = new Types.ObjectId(query.walletId);
    }

    // Add date range filter
    if (query.fromDate || query.toDate) {
      filter.createdAt = {};

      if (query.fromDate) {
        const fromDate = new Date(query.fromDate);
        fromDate.setUTCHours(0, 0, 0, 0);
        filter.createdAt.$gte = fromDate;
      }

      if (query.toDate) {
        const toDate = new Date(query.toDate);
        toDate.setUTCHours(23, 59, 59, 999);
        filter.createdAt.$lte = toDate;
      }
    }
  }
}
