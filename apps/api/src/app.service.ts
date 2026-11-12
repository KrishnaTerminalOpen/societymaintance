import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'ColonyDeposit Payment & Job Engine',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}

