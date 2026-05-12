import { Injectable } from '@nestjs/common';
import * as os from 'os';

@Injectable()
export class AdminService {
  getStats() {
    return {
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        usage: process.memoryUsage(),
      },
      cpu: os.cpus(),
      uptime: process.uptime(),
      loadavg: os.loadavg(),
      platform: os.platform(),
      timestamp: new Date(),
    };
  }
}
