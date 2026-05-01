import { Module } from '@nestjs/common';
import { FeatureFlagService } from './services/feature-flag.service';
import { FeatureFlagController } from './controllers/feature-flag.controller';

@Module({
  controllers: [FeatureFlagController],
  providers: [FeatureFlagService],
  exports: [FeatureFlagService],
})
export class AdminModule {}
