import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';
import { KafkaConsumerService } from '@gpe/backend-common/dist/shared/kafka/consumer';

describe('EventsService', () => {
  let service: EventsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: KafkaConsumerService,
          useValue: {
            consume: jest.fn().mockReturnValue({
              pipe: jest.fn().mockReturnValue({ subscribe: jest.fn() })
            })
          }
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
