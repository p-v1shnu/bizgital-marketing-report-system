import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      service: 'bizgital-marketing-report-backend',
      status: 'ok',
      timestamp: new Date().toISOString(),
      assumptions: {
        phase: 'foundation',
        cadence: 'monthly-first',
        futureCadences: ['quarterly', 'yearly'],
        workflow: ['draft', 'submitted', 'approved', 'rejected'],
        immutableStates: ['approved', 'rejected'],
        dashboardSource: 'latest-approved-version-only'
      }
    };
  }
}
