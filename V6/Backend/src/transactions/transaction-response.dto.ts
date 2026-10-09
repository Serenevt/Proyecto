import { ApiProperty } from '@nestjs/swagger';
import { TransactionViewDto } from '../common/response.dto';
export class TransactionResponseDto {
  @ApiProperty({ type: TransactionViewDto })
  transaction: TransactionViewDto;
  @ApiProperty({ example: 100 }) pointsEarned: number;
  @ApiProperty({ example: false }) replayed: boolean;
}
