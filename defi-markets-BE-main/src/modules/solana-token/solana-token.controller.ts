import { 
  Controller, 
  Get, 
  Post,
  Body,
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBearerAuth 
} from '@nestjs/swagger';
import { SolanaTokenService } from './solana-token.service';
import { JupiterToken } from './interfaces/jupiter-token.interface';
import { CreateLstAssetDto, CreateLstAssetBatchDto } from './dto/create-lst-asset.dto';
import { FetchTokensDto } from './dto/fetch-tokens.dto';

@ApiTags('Solana Tokens')
@ApiBearerAuth()
@Controller('api/v1/solana-tokens')
export class SolanaTokenController {
  constructor(private readonly solanaTokenService: SolanaTokenService) {}

  @Post('verified')
  @ApiOperation({ summary: 'Get verified tokens from Jupiter API and create asset allocations' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved and processed verified tokens' })
  async getVerifiedTokens(@Body() fetchTokensDto: FetchTokensDto): Promise<JupiterToken[]> {
    return await this.solanaTokenService.getVerifiedTokens(fetchTokensDto.network);
  }

  @Post('lst/fetch')
  @ApiOperation({ summary: 'Get LST tokens from Jupiter API' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved LST tokens' })
  async getLstTokens(@Body() fetchTokensDto: FetchTokensDto): Promise<JupiterToken[]> {
    return await this.solanaTokenService.getLstTokens(fetchTokensDto.network);
  }

  @Post('lst')
  @ApiOperation({ summary: 'Create or update a single LST token in asset allocation' })
  @ApiResponse({ status: 201, description: 'Successfully created or updated LST token' })
  @ApiResponse({ status: 400, description: 'Bad request - invalid data' })
  async createLstAsset(@Body() createLstAssetDto: CreateLstAssetDto) {
    return await this.solanaTokenService.createLstAsset(createLstAssetDto);
  }

  @Post('lst/batch')
  @ApiOperation({ summary: 'Create or update multiple LST tokens in asset allocation' })
  @ApiResponse({ status: 201, description: 'Successfully processed LST tokens batch' })
  @ApiResponse({ status: 400, description: 'Bad request - invalid data' })
  async createLstAssetBatch(@Body() createLstAssetBatchDto: CreateLstAssetBatchDto) {
    return await this.solanaTokenService.createLstAssetBatch(createLstAssetBatchDto);
  }

  @Post('lst/fetch-and-create')
  @ApiOperation({ summary: 'Fetch LST tokens from Jupiter API and create/update them in asset allocation' })
  @ApiResponse({ status: 201, description: 'Successfully fetched and processed LST tokens' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async fetchAndCreateLstTokens(@Body() fetchTokensDto: FetchTokensDto) {
    return await this.solanaTokenService.fetchAndCreateLstTokens(fetchTokensDto.network);
  }
}
