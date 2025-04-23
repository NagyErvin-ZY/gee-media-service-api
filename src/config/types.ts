import { IGPEAppConfig } from '@gpe/backend-common/dist/shared/config/types';

export type QuestionType = 'text' | 'multiText' | 'dob' | 'category';

export interface BaseQuestion<T extends QuestionType = QuestionType> {
  id: string;
  type: T;
  label: string;
  mandatory: boolean;
  skippable?: boolean;
  errorMessages?: string[];
}

export interface TextQuestion extends BaseQuestion<'text'> {
  placeholder?: string;
}

export interface MultiTextQuestion extends BaseQuestion<'multiText'> {
  fields: {
    id: string;
    placeholder?: string;
    errorMessages?: string[];
  }[];
}

export interface DOBQuestion extends BaseQuestion<'dob'> { }

export interface CategoryQuestion extends BaseQuestion<'category'> {
  options: {
    value: string;
    label: string;
  }[];
}

export type Question =
  | TextQuestion
  | MultiTextQuestion
  | DOBQuestion
  | CategoryQuestion;

export type OnboardingConfig = {
  questions: Question[];
};

export type KafkaConfigWithTopics = IGPEAppConfig['db']['kafka'] & {
};

export interface AWSS3Config {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  urlPrefix: string;
  profile: string; // AWS profile name
  useProfile: boolean; // Whether to use AWS profile instead of direct credentials
}

export interface MediaConfig {
  allowedMimeTypes: string[];
  maxFileSize: number; // in bytes
  defaultQuality: number; // WebP compression quality (0-100)
}

export interface GPEUserServiceConfig extends IGPEAppConfig {
  db: IGPEAppConfig['db'] & {
    kafka: KafkaConfigWithTopics
  };
  aws: {
    s3: AWSS3Config;
  };
  media: MediaConfig;
}