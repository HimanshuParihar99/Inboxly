import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ImapConnectionService } from '../services/imap-connection.service';
import { ImapSyncService } from '../services/imap-sync.service';
import { EmailProcessorService } from '../services/email-processor.service';
import { SearchService } from '../services/search.service';
import type {
  ImapConnectionConfig,
} from '../interfaces/imap-connection.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Connection } from '../schemas/connection.schema';
import { Email } from '../schemas/email.schema';

@Controller('imap/operations')
@UseGuards(JwtAuthGuard)
export class ImapController {
  constructor(
    private readonly imapConnectionService: ImapConnectionService,
    private readonly imapSyncService: ImapSyncService,
    private readonly emailProcessorService: EmailProcessorService,
    private readonly searchService: SearchService,
    @InjectModel('Connection')
    private readonly connectionModel: Model<Connection>,
    @InjectModel('Email') private readonly emailModel: Model<Email>,
  ) {}

  @Post('test-connection')
  async testConnection(@Body() connectionConfig: ImapConnectionConfig) {
    try {
      // Use public method to connect
      const connectionId = await this.imapConnectionService.connect(
        connectionConfig,
      );
      await this.imapConnectionService.closeConnection(connectionId);

      return { success: true, message: 'Connection test successful' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @Get('status')
  async getImapStatus() {
    return {
      activeConnections: this.imapConnectionService.getActiveConnectionsCount(),
      syncStatus: this.imapSyncService.getSyncStatus(),
    };
  }

  @Get('folders/:connectionId')
  async getFolders(@Param('connectionId') connectionId: string) {
    try {
      const folders = await this.imapConnectionService.getFolders(connectionId);
      return { success: true, folders };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @Get('emails')
  async getEmails(
    @Query('userId') userId: string,
    @Query('connectionId') connectionId?: string,
    @Query('folderPath') folderPath?: string,
    @Query('limit') limit?: number,
    @Query('skip') skip?: number,
  ) {
    try {
      const filter: any = { userId };
      if (connectionId) filter.connectionId = connectionId;
      if (folderPath) filter.folderPath = folderPath;

      const emails = await this.emailModel
        .find(filter)
        .sort({ date: -1 })
        .skip(skip ? parseInt(skip.toString()) : 0)
        .limit(limit ? parseInt(limit.toString()) : 20)
        .exec();

      const total = await this.emailModel.countDocuments(filter).exec();

      return {
        emails,
        total,
        limit: limit ? parseInt(limit.toString()) : 20,
        skip: skip ? parseInt(skip.toString()) : 0,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @Get('analytics/:connectionId')
  async getConnectionAnalytics(@Param('connectionId') connectionId: string) {
    try {
      const connection = await this.connectionModel.findById(connectionId);
      if (!connection) return { success: false, error: 'Connection not found' };

      const analytics = await this.emailModel.aggregate([
        { $match: { connectionId } },
        {
          $group: {
            _id: null,
            totalEmails: { $sum: 1 },
            totalAttachments: {
              $sum: { $cond: [{ $gt: [{ $size: '$attachments' }, 0] }, 1, 0] },
            },
            avgSize: { $avg: '$size' },
            oldestEmail: { $min: '$date' },
            newestEmail: { $max: '$date' },
          },
        },
      ]);

      return { success: true, analytics: analytics[0] || { totalEmails: 0 } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Example of folder listing using fixed public methods
  @Get('connections/:id/folders/list')
  async listConnectionFolders(@Param('id') id: string) {
    try {
      const connection = await this.connectionModel.findById(id).exec();
      if (!connection) return { success: false, error: 'Connection not found' };

      const connectionId = await this.imapConnectionService.connect(
        connection.config,
      );
      const folders = await this.imapConnectionService.getFolders(connectionId);
      await this.imapConnectionService.closeConnection(connectionId);

      return { success: true, folders };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // All other endpoints (sync, search, emails by ID, etc.) should call
  // public methods like imapConnectionService.connect and imapConnectionService.getFolders
  // instead of private methods.
}
