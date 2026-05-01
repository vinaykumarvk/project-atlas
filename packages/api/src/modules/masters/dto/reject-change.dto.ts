import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for rejecting a master data change.
 * A reason must be provided when rejecting a change.
 */
export class RejectChangeDto {
  @ApiProperty({
    description: 'The reason for rejecting this change (mandatory)',
    example: 'PIN code range overlaps with existing record for this city',
    minLength: 3,
  })
  @IsString()
  @IsNotEmpty({ message: 'Rejection reason is required' })
  @MinLength(3, { message: 'Rejection reason must be at least 3 characters' })
  reason!: string;
}
