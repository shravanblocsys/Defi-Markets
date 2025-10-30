import { IsNumber, IsPositive } from "class-validator";

export class CheckMinDepositDto {
  @IsNumber()
  @IsPositive()
  minDeposit: number;
}

export class CheckMinRedeemDto {
  @IsNumber()
  @IsPositive()
  minRedeem: number;
}
