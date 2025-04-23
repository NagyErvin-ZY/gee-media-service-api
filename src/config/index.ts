import { IGPEAppConfig } from '@gpe/backend-common/dist/shared/config/types';
import { parseEnv } from '@gpe/backend-common/dist/shared/utils'
import * as winston from 'winston';
import type { GPEUserServiceConfig } from './types';
import { configDotenv } from 'dotenv';

configDotenv()

const config = Object.freeze<GPEUserServiceConfig>({
  serviceName: 'gpe-media-api-service',
  db: {
    mongo: {
      connectionString: parseEnv<string>(process.env.MONGODB_URI, 'mongodb://localhost:27017/gpe-media-api-service')
    },
    kafka: {
      brokers: parseEnv<string>(process.env.KAFKA_BROKERS, 'localhost:19092'),
      clientId: parseEnv<string>(process.env.KAFKA_CLIENT_ID, 'gpe-media-api-service-d'),
      consumerGroupId: "gpe-media-api-service-deploymnet-d"
    }
  },
  auth: {
    userAuthHeader: parseEnv<string>(process.env.USER_AUTH_HEADER, 'authorization'),
    mappingTable: {
      tableName: parseEnv<string>(process.env.DYNAMODB_TABLENAME, "gpe-dev-cognito-mongo-id-map"),
      region: parseEnv<string>(process.env.DYNAMODB_REGION, "eu-central-1"),
      profile: parseEnv<string>(process.env.DYNAMODB_PROFILE, "gpe"),
    }
  },
  server: {
    port: parseEnv<number>(process.env.PORT, 3010)
  },
  logging: {
    winston: {
      level: parseEnv<string>(process.env.LOG_LEVEL, 'debug'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console()
      ]
    }
  },
  aws: {
    s3: {
      accessKeyId: parseEnv<string>(process.env.AWS_ACCESS_KEY_ID, ''),
      secretAccessKey: parseEnv<string>(process.env.AWS_SECRET_ACCESS_KEY, ''),
      region: parseEnv<string>(process.env.AWS_REGION, 'eu-central-1'),
      bucket: parseEnv<string>(process.env.AWS_S3_BUCKET, 'gpe-media-dev'),
      urlPrefix: parseEnv<string>(process.env.AWS_S3_URL_PREFIX, 'https://gpe-media-dev.s3.eu-central-1.amazonaws.com'),
      profile: parseEnv<string>(process.env.AWS_S3_PROFILE, 'gpe'),
      useProfile: parseEnv<boolean>(process.env.AWS_S3_USE_PROFILE, true)
    }
  },
  media: {
    allowedMimeTypes: parseEnv<string>(process.env.ALLOWED_MIME_TYPES, 'image/jpeg,image/png,image/webp').split(','),
    maxFileSize: parseEnv<number>(process.env.MAX_FILE_SIZE, 10 * 1024 * 1024), // 10MB default
    defaultQuality: parseEnv<number>(process.env.DEFAULT_WEBP_QUALITY, 80)
  }
});

export default config;