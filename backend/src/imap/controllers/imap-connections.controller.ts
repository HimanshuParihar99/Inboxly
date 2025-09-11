import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ImapConnectionsService } from '../services/imap-connections.service';
import { ImapSyncService } from '../services/imap-sync.service';
import { ImapAnalyticsService } from '../services/imap-analytics.service';

@Controller('imap/connections')
@UseGuards(JwtAuthGuard)
export class ImapConnectionsController {
  constructor(
    private readonly connectionsService: ImapConnectionsService,
    private readonly syncService: ImapSyncService,
    private readonly analyticsService: ImapAnalyticsService,
  ) {}

  @Get()
  findAll(@Request() req) {
    return this.connectionsService.findAll(req.user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.connectionsService.findOne(id, req.user.userId);
  }

  @Post()
  create(@Body() createConnectionDto: any, @Request() req) {
    return this.connectionsService.create(createConnectionDto, req.user.userId);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateConnectionDto: any,
    @Request() req,
  ) {
    return this.connectionsService.update(
      id,
      updateConnectionDto,
      req.user.userId,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.connectionsService.remove(id, req.user.userId);
  }

  @Post('test')
  testConnection(@Body() connectionConfig: any) {
    return this.connectionsService.testConnection(connectionConfig);
  }

  @Post(':id/sync/start')
  startSync(@Param('id') id: string, @Body() syncData: { destinationId: string }) {
    return this.syncService.startSync(id, syncData.destinationId);
  }

  @Post(':id/sync/pause')
  pauseSync(@Param('id') id: string) {
    return this.syncService.pauseSync(id);
  }

  @Post(':id/sync/resume')
  resumeSync(@Param('id') id: string) {
    return this.syncService.resumeSync(id);
  }

  @Post(':id/sync/cancel')
  cancelSync(@Param('id') id: string) {
    return this.syncService.cancelSync(id);
  }

  @Get(':id/analytics')
  getConnectionAnalytics(@Param('id') id: string, @Request() req) {
    return this.analyticsService.getConnectionAnalytics(id, req.user.userId);
  }

  @Post('security/analyze')
  analyzeServerSecurity(@Body() serverConfig: { host: string; port: number }) {
    return this.analyticsService.analyzeServerSecurity(
      serverConfig.host,
      serverConfig.port,
    );
  }
}