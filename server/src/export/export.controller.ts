import { Controller, Get, Headers, HttpCode, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { safeTokenEqual } from '../common/tokens.js';
import { ExportService, type ExportResponseDto } from './export.service.js';

export const EXPORT_TOKEN_HEADER = 'x-export-token';

/**
 * GET /v1/export — the static-site build payload. Protected by the build
 * token (D7), compared in constant time; exempt from the throttler.
 */
@Controller('export')
export class ExportController {
    constructor(
        private readonly exportService: ExportService,
        private readonly config: ConfigService,
    ) {}

    @Get()
    @HttpCode(200)
    async export(
        @Headers(EXPORT_TOKEN_HEADER) token: string | undefined,
    ): Promise<ExportResponseDto> {
        const expected = this.config.get<string>('EXPORT_TOKEN');
        if (!token || !expected || !safeTokenEqual(token, expected)) {
            throw new UnauthorizedException('missing or invalid export token');
        }
        return this.exportService.buildExport();
    }
}
