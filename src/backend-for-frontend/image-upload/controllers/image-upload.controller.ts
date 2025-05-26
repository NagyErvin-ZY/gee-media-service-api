import {
  Controller,
  Post,
  Get,
  Query,
  Req,
  Logger,
  BadRequestException,
  Param,
  NotFoundException,
  ForbiddenException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { ImageUploadService } from '../services/image-upload.service';
import { UploadResponseDto } from '../../../shared/dto/upload-response.dto';
import { ClaimBasedUploadDto } from '../dto/claim-based-upload.dto';
import {
  ApiConsumes,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiQuery,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Observable, throwError, tap } from 'rxjs';
import { Request } from 'express';
import { WithDecodedUserJWT, UserID } from '@gpe/backend-common/dist/auth';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('images')
@Controller('images')
export class ImageUploadController {
  private readonly logger = new Logger(ImageUploadController.name);

  constructor(
    private readonly imageUploadService: ImageUploadService,
  ) {
    this.logger.log('ImageUploadController initialized');
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload and process an image using a claim' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'claimId', required: true, description: 'Claim ID for this upload' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file to upload',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Image successfully uploaded and processed',
    type: UploadResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request or invalid claim' })
  @ApiResponse({ status: 403, description: 'Claim cannot be used or user not authorized' })
  @ApiResponse({ status: 415, description: 'Unsupported media type' })
  @ApiBearerAuth()
  @WithDecodedUserJWT()
  @UseInterceptors(FileInterceptor('file'))
  uploadImageWithClaim(
    @Req() req: Request,
    @UserID() userId: string,
    @Query('claimId') claimId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Observable<UploadResponseDto> {
    this.logger.log(`Received claim-based image upload request: claimId=${claimId}`);


    if (!file) {
      return throwError(() => new BadRequestException('No file provided'));
    }

    this.logger.log(`Processing claim-based request for file: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);

    return this.imageUploadService.uploadImageWithClaim(file, claimId, userId).pipe(
      tap(result => {
        this.logger.log(`Claim-based upload completed successfully: url=${result.url}, size=${result.fileSize} bytes`);
      })
    );
  }
}