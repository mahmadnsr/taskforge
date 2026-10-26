import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { QueuesService } from './queues.service.js';
import { createRedisConfig } from '../config/redis.config.js';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: createRedisConfig(config),
      }),
    }),
    BullModule.registerQueue({
      name: 'taskforge',
    }),
  ],
  providers: [QueuesService],
  exports: [QueuesService],
})
export class QueuesModule {}
