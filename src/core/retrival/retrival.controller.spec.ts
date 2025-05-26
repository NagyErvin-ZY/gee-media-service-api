import { Test, TestingModule } from '@nestjs/testing';
import { RetrivalController } from './retrival.controller';

describe('RetrivalController', () => {
  let controller: RetrivalController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RetrivalController],
    }).compile();

    controller = module.get<RetrivalController>(RetrivalController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
