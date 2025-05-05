import { Injectable, NestMiddleware, Logger, PayloadTooLargeException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as multer from 'multer';
import config from '../../config';

@Injectable()
export class FileUploadMiddleware implements NestMiddleware {
  private readonly upload: multer.Multer;
  private readonly logger = new Logger(FileUploadMiddleware.name);

  constructor() {
    this.logger.log('Initializing FileUploadMiddleware');
    this.logger.log(`Allowed mime types: ${config.media.allowedMimeTypes.join(', ')}`);
    this.logger.log(`Max file size: ${config.media.maxFileSize} bytes (${config.media.maxFileSize / (1024 * 1024)} MB)`);
    
    // Configure multer for memory storage (no temp files on disk)
    this.upload = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: config.media.maxFileSize,
      },
      fileFilter: (req, file, cb) => {
        this.logger.log(`Received file: name=${file.originalname}, mimetype=${file.mimetype}, size=${file.size || 'unknown'}`);
        
        // Check if the mime type is allowed
        if (config.media.allowedMimeTypes.includes(file.mimetype)) {
          this.logger.log(`File type ${file.mimetype} is allowed, proceeding with upload`);
          cb(null, true);
        } else {
          const errorMessage = `Unsupported file type: ${file.mimetype}. Allowed types: ${config.media.allowedMimeTypes.join(', ')}`;
          this.logger.warn(errorMessage);
          // Pass null as first parameter instead of Error object
          cb(null, false);
          // Store the error message on the request so it can be used later
          (req as any).fileValidationError = errorMessage;
        }
      },
    });
    
    this.logger.log('FileUploadMiddleware initialized successfully');
  }

  use(req: Request, res: Response, next: NextFunction) {
    this.logger.log(`Request received: ${req.method} ${req.path}`);
    
    // Only use this middleware for routes that handle file uploads
    if (req.path.includes('/upload/') || req.path === '/api/v1/upload') {
      this.logger.log('Upload route detected, applying file upload middleware');
      
      // DDOS Prevention Step 1: Check Content-Length header before processing the request
      // This prevents clients from sending files that are much larger than our limit
      const contentLength = req.headers['content-length'] ? parseInt(req.headers['content-length'], 10) : 0;
      
      // Add a buffer to account for multipart form data overhead (20% more than our actual limit)
      const headerSizeLimit = Math.ceil(config.media.maxFileSize * 1.2);
      
      if (contentLength > headerSizeLimit) {
        const errorMessage = `Request body too large: ${contentLength} bytes. Maximum allowed size is ${config.media.maxFileSize} bytes`;
        this.logger.warn(`Rejecting oversized request based on Content-Length header: ${errorMessage}`);
        return res.status(413).json({
          statusCode: 413,
          message: errorMessage,
          error: 'Payload Too Large'
        });
      }
      
      // DDOS Prevention Step 2: Use multer's file size limits to validate the actual file size
      // This will be enforced during the actual file processing
      this.upload.single('file')(req, res, (err) => {
        if (err) {
          if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            // This is a file size limit error from multer
            const errorMessage = `File size exceeds the limit of ${config.media.maxFileSize / (1024 * 1024)} MB`;
            this.logger.warn(`Multer file size limit exceeded: ${errorMessage}`);
            return res.status(413).json({
              statusCode: 413,
              message: errorMessage,
              error: 'Payload Too Large'
            });
          }
          
          this.logger.error(`Multer error: ${err.message}`, err.stack);
          return res.status(400).json({
            statusCode: 400,
            message: err.message,
          });
        }
        
        // Check if we have a file validation error
        if ((req as any).fileValidationError) {
          this.logger.warn(`File validation error: ${(req as any).fileValidationError}`);
          return res.status(400).json({
            statusCode: 400,
            message: (req as any).fileValidationError,
          });
        }
        
        // Check if file was provided
        if (!req.file) {
          this.logger.warn('No file was uploaded in the request');
          return res.status(400).json({
            statusCode: 400,
            message: 'No file uploaded',
          });
        }
        
        // DDOS Prevention Step 3: Final verification of the file size in memory
        if (req.file.size > config.media.maxFileSize) {
          const errorMessage = `File size of ${req.file.size} bytes exceeds the limit of ${config.media.maxFileSize} bytes`;
          this.logger.warn(`Final size validation failed: ${errorMessage}`);
          return res.status(413).json({
            statusCode: 413,
            message: errorMessage,
            error: 'Payload Too Large'
          });
        }
        
        this.logger.log(`File uploaded successfully: ${req.file.originalname} (${req.file.size} bytes)`);
        next();
      });
    } else {
      this.logger.debug(`Skipping file upload middleware for non-upload route: ${req.path}`);
      next();
    }
  }
}