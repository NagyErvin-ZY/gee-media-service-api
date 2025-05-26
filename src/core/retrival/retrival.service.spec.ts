import { Test, TestingModule } from '@nestjs/testing';
import { RetrivalService } from './retrival.service';

describe('RetrivalService', () => {
  let service: RetrivalService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RetrivalService],
    }).compile();

    service = module.get<RetrivalService>(RetrivalService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
