import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  HttpStatus,
  HttpCode,
  Req
} from '@nestjs/common';
import { VaultManagementFeesService } from './vault-management-fees.service';
import { VaultFeesCalculationService } from './vault-fees-calculation.service';
import { CreateVaultManagementFeeDto } from './dto/create-vault-management-fee.dto';
import { UpdateVaultManagementFeeDto } from './dto/update-vault-management-fee.dto';
import { FeeStatus } from './entities/vault-management-fee.entity';
import { UsePagination } from '../../middlewares/pagination/pagination.decorator';

@Controller('api/v1/vault-management-fees')
export class VaultManagementFeesController {
  constructor(
    private readonly vaultManagementFeesService: VaultManagementFeesService,
    private readonly vaultFeesCalculationService: VaultFeesCalculationService
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createVaultManagementFeeDto: CreateVaultManagementFeeDto) {
    return await this.vaultManagementFeesService.create(createVaultManagementFeeDto);
  }

  @Get()
  @UsePagination()
  async findAll(
    @Req() req: any,
    @Query('vaultName') vaultName?: string,
    @Query('status') status?: FeeStatus,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return await this.vaultManagementFeesService.findAll(
      req,
      vaultName,
      status,
      dateFrom,
      dateTo,
    );
  }

  @Get('statistics')
  async getStatistics() {
    return await this.vaultManagementFeesService.getFeeStatistics();
  }

  @Get('vault-index/:vaultIndex')
  async findByVaultIndex(@Param('vaultIndex', ParseIntPipe) vaultIndex: number) {
    return await this.vaultManagementFeesService.findByVaultIndex(vaultIndex);
  }

  @Get('vault-name/:vaultName')
  async findByVaultName(@Param('vaultName') vaultName: string) {
    return await this.vaultManagementFeesService.findByVaultName(vaultName);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.vaultManagementFeesService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string, 
    @Body() updateVaultManagementFeeDto: UpdateVaultManagementFeeDto
  ) {
    return await this.vaultManagementFeesService.update(id, updateVaultManagementFeeDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.vaultManagementFeesService.remove(id);
  }

  @Post('calculate-all')
  @HttpCode(HttpStatus.OK)
  async calculateAllVaultFees() {
    await this.vaultFeesCalculationService.calculateAllVaultFees();
    return { message: 'Vault fees calculation completed successfully' };
  }

  @Post('calculate/:vaultIndex')
  @HttpCode(HttpStatus.OK)
  async calculateVaultFees(@Param('vaultIndex', ParseIntPipe) vaultIndex: number) {
    const result = await this.vaultFeesCalculationService.calculateVaultFees(vaultIndex);
    return result;
  }

  @Get('vault-summary')
  async getVaultSummary() {
    return await this.vaultManagementFeesService.getVaultSummary();
  }
}
