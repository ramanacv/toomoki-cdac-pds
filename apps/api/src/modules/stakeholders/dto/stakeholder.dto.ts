import { IsEnum, IsString } from 'class-validator';
import { StakeholderStatus, StakeholderType } from '@pds/shared-types';

export class StakeholderCreateDto {
  @IsString()
  stakeholderId!: string;

  @IsEnum(StakeholderType)
  stakeholderType!: StakeholderType;

  @IsString()
  name!: string;

  @IsString()
  district!: string;

  @IsString()
  licenseNo!: string;

  @IsEnum(StakeholderStatus)
  status!: StakeholderStatus;
}
