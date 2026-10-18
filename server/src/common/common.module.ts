import { Global, Module } from '@nestjs/common';
import { TtlCacheService } from './ttl-cache.service.js';

/** Shared infrastructure providers, visible to every feature module. */
@Global()
@Module({
    providers: [TtlCacheService],
    exports: [TtlCacheService],
})
export class CommonModule {}
