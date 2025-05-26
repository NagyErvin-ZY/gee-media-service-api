import { Controller, Get, Post, Param, HttpStatus, HttpCode, NotFoundException, BadRequestException, Body, Head, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse, ApiNotFoundResponse, ApiBody, ApiBadRequestResponse } from '@nestjs/swagger';
import { RetrivalService, BulkExistenceResult } from './retrival.service';
import { IImageAsset, IVideoAsset } from '@gpe/backend-common/dist/schema/media';
import { BulkRetrievalDto } from './dto/bulk-retrieval.dto';
import { AssetIdParamDto } from './dto/asset-id-param.dto';

@ApiTags('retrieval')
@Controller('v1/core/retrival')
export class RetrivalController {
    constructor(private readonly retrivalService: RetrivalService) { }

    @Get(':assetId')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Get asset by ID', description: 'Retrieves an asset (image or video) using its ID. Format: {type}-{mongoid}' })
    @ApiParam({ name: 'assetId', description: 'The asset ID in format type-mongoId (e.g., image-123456 or video-123456)' })
    @ApiResponse({ status: 200, description: 'The asset was successfully retrieved' })
    @ApiNotFoundResponse({ description: 'Asset with the specified ID was not found' })
    @ApiBadRequestResponse({ description: 'Invalid asset ID format or unsupported asset type' })
    async getAssetById(@Param() params: AssetIdParamDto): Promise<IImageAsset | IVideoAsset> {
        return this.retrivalService.getAssetById(params.assetId);
    }

    @Head(':assetId')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Check if asset exists',
        description: 'Checks if an asset exists without retrieving its data. Returns 200 OK if asset exists, 404 Not Found if it does not.'
    })
    @ApiParam({ name: 'assetId', description: 'The asset ID in format type-mongoId (e.g., image-123456 or video-123456)' })
    @ApiResponse({ status: 200, description: 'Asset exists', schema: { type: 'object' } })
    @ApiNotFoundResponse({ description: 'Asset with the specified ID was not found' })
    @ApiBadRequestResponse({ description: 'Invalid asset ID format or unsupported asset type' })
    async headAssetById(@Param() params: AssetIdParamDto): Promise<void> {
        const result = await this.retrivalService.headAsset(params.assetId);
        if (!result.exists) {
            throw new NotFoundException(`Asset with ID "${params.assetId}" not found`);
        }
    }

    @Post('bulk')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Bulk retrieve assets',
        description: 'Retrieves multiple assets in a single request. Returns an object where keys are the asset IDs and values are the assets.'
    })
    @ApiBody({ type: BulkRetrievalDto })
    @ApiResponse({
        status: 200,
        description: 'Assets were successfully retrieved',
        schema: {
            type: 'object',
            additionalProperties: {
                type: 'object',
                description: 'Asset object (image or video)'
            },
            example: {
                'image-123456': { /* Image asset properties */ },
                'video-789012': { /* Video asset properties */ }
            }
        }
    })
    @ApiBadRequestResponse({ description: 'Invalid request format or too many asset IDs requested' })
    async bulkRetrieveAssets(@Body() dto: BulkRetrievalDto): Promise<Record<string, IImageAsset | IVideoAsset>> {
        return this.retrivalService.getMultipleAssets(dto.ids);
    }

    @Post('bulk-head')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Check multiple assets existence',
        description: 'Efficiently checks if multiple assets exist without retrieving their data. Returns a map of asset IDs to existence information.'
    })
    @ApiBody({ type: BulkRetrievalDto })
    @ApiResponse({
        status: 200,
        description: 'Assets existence check completed',
        schema: {
            type: 'object',
            additionalProperties: {
                type: 'object',
                properties: {
                    exists: { type: 'boolean' },
                    type: { type: 'string', nullable: true }
                },
                required: ['exists']
            },
            example: {
                'image-123456': { exists: true, type: 'image' },
                'video-789012': { exists: false, type: null }
            }
        }
    })
    @ApiBadRequestResponse({ description: 'Invalid request format or too many asset IDs requested' })
    async bulkHeadAssets(@Body() dto: BulkRetrievalDto): Promise<BulkExistenceResult> {
        return this.retrivalService.bulkHeadAssets(dto.ids);
    }
}
