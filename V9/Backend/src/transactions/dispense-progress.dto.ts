import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

/**
 * Avance del abastecimiento mientras la manguera dispensa.
 *
 * Es informativo: no mueve saldo ni crea cobro. El saldo ya está comprometido
 * desde la reserva, y el importe definitivo lo fija la confirmación final. El
 * backend rechaza cualquier avance que supere lo reservado, de modo que una
 * simulación runaway no pueda inventarse consumo.
 */
export class DispenseProgressDto {
  @ApiProperty({
    example: '43.50',
    description: 'Importe despachado hasta ahora, en soles.',
  })
  @IsString()
  @Matches(/^\d{1,6}(\.\d{1,2})?$/)
  amount: string;

  @ApiProperty({
    example: '1.851',
    description: 'Galones despachados hasta ahora; hasta 3 decimales.',
  })
  @IsString()
  @Matches(/^\d{1,6}(\.\d{1,3})?$/)
  gallons: string;
}
