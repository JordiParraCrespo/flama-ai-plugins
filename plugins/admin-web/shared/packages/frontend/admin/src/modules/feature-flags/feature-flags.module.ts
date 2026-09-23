import { ContainerModule } from 'inversify';
import { TOKENS } from '../../di/tokens';
import { FeatureFlagsAdminRepository } from './feature-flags.repository';
import { FeatureFlagsAdminService } from './feature-flags.service';

export const FeatureFlagsAdminModule = new ContainerModule(({ bind }) => {
  bind(TOKENS.FeatureFlagsAdminRepository).to(FeatureFlagsAdminRepository).inSingletonScope();
  bind(TOKENS.FeatureFlagsAdminService).to(FeatureFlagsAdminService).inSingletonScope();
});
