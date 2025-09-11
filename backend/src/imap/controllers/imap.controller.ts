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
  ImapConnectionStatus,
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

  // IMAP operations endpoints

  @Post('test-connection')
  async testConnection(@Body() connectionConfig: ImapConnectionConfig) {
    try {
      // Test the connection
      const connectionId =
        await this.imapConnectionService.createConnection(connectionConfig);
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

  @Get('search/basic')
  async basicSearchEmails(
    @Query('userId') userId: string,
    @Query('query') query: string,
    @Query('limit') limit: number = 20,
    @Query('skip') skip: number = 0,
    @Query('connectionId') connectionId?: string,
    @Query('folder') folder?: string,
  ) {
    return this.searchService.searchEmails(userId, query, {
      limit,
      skip,
      connectionId,
      folderPath: folder,
    });
  }
  // Email operations endpoints

  @Get('emails/list')
  async listEmails(
    @Query('userId') userId: string,
    @Query('connectionId') connectionId?: string,
    @Query('folder') folder?: string,
    @Query('limit') limit: number = 20,
    @Query('skip') skip: number = 0,
  ) {
    const query: any = { userId };

    if (connectionId) {
      query.connectionId = connectionId;
    }

    if (folder) {
      query.folderPath = folder;
    }

    return this.emailModel
      .find(query)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  @Get('emails/by-id/:id')
  async getEmailById(@Param('id') id: string) {
    return this.emailModel.findById(id).exec();
  }

  // Sync operations endpoints

  @Post('sync/:connectionId/start')
  async startSync(@Param('connectionId') connectionId: string) {
    try {
      const connection = await this.connectionModel.findById(connectionId);

      if (!connection) {
        return { success: false, error: 'Connection not found' };
      }

      // We need a destination connection ID, not the config object
      // This needs to be fixed by providing a proper destination connection ID
      // For now, using a placeholder solution
      const destConnectionId = connectionId; // This should be replaced with the actual destination ID
      await this.imapSyncService.startSync(connectionId, destConnectionId);
      return { success: true, message: 'Sync started successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @Post('sync/:connectionId/pause')
  async pauseSync(@Param('connectionId') connectionId: string) {
    try {
      await this.imapSyncService.pauseSync(connectionId);
      return { success: true, message: 'Sync paused successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @Post('sync/:connectionId/resume')
  async resumeSync(@Param('connectionId') connectionId: string) {
    try {
      const connection = await this.connectionModel.findById(connectionId);

      if (!connection) {
        return { success: false, error: 'Connection not found' };
      }

      await this.imapSyncService.resumeSync(connectionId);
      return { success: true, message: 'Sync resumed successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  @Post('sync/:connectionId/cancel')
  async cancelSync(@Param('connectionId') connectionId: string) {
    try {
      await this.imapSyncService.cancelSync(connectionId);
      return { success: true, message: 'Sync canceled successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Analytics endpoints

  @Get('analytics/:connectionId')
  async getConnectionAnalytics(@Param('connectionId') connectionId: string) {
    try {
      const connection = await this.connectionModel.findById(connectionId);

      if (!connection) {
        return { success: false, error: 'Connection not found' };
      }

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

  // Folder management endpoints

  @Get('connections/:id/folders/list')
  async listConnectionFolders(@Param('id') id: string) {
    try {
      const connection = await this.connectionModel.findById(id).exec();
      if (!connection) {
        return { success: false, error: 'Connection not found' };
      }

      // Create a temporary connection
      const connectionId = await this.imapConnectionService.createConnection(
        connection.config,
      );

      // Get folders
      const folders =
        await this.imapConnectionService.listFolders(connectionId);

      // Close the connection
      await this.imapConnectionService.closeConnection(connectionId);

      return { success: true, folders };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Sync endpoints

  @Post('sync/between-connections')
  async startSyncBetweenConnections(
    @Body() syncData: { sourceId: string; destinationId: string },
  ) {
    try {
      const { sourceId, destinationId } = syncData;

      // Get connections from database
      const sourceConnection = await this.connectionModel
        .findById(sourceId)
        .exec();
      const destConnection = await this.connectionModel
        .findById(destinationId)
        .exec();

      if (!sourceConnection || !destConnection) {
        return { success: false, error: 'Connection not found' };
      }

      // Create IMAP connections
      const sourceConnectionId =
        await this.imapConnectionService.createConnection(
          sourceConnection.config,
        );
      const destConnectionId =
        await this.imapConnectionService.createConnection(
          destConnection.config,
        );

      // Start sync
      const taskId = await this.imapSyncService.startSync(
        sourceConnectionId,
        destConnectionId,
      );

      return { success: true, taskId };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @Post('sync/:taskId/pause')
  async pauseSyncTask(@Param('taskId') taskId: string) {
    try {
      this.imapSyncService.pauseSync(taskId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @Post('sync/:taskId/resume')
  async resumeSyncTask(@Param('taskId') taskId: string) {
    try {
      this.imapSyncService.resumeSync(taskId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @Post('sync/:taskId/cancel')
  async cancelSyncByTaskId(@Param('taskId') taskId: string) {
    try {
      this.imapSyncService.cancelSync(taskId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Email endpoints

  @Get('emails')
  async getEmails(
    @Query('userId') userId: string,
    @Query('connectionId') connectionId?: string,
    @Query('folderPath') folderPath?: string,
    @Query('limit') limit?: number,
    @Query('skip') skip?: number,
  ) {
    try {
      const filter: any = {};

      if (connectionId) {
        filter.connectionId = connectionId;
      }

      if (folderPath) {
        filter.folderPath = folderPath;
      }

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

  @Get('emails/detail/:id')
  async getEmailDetail(@Param('id') id: string) {
    try {
      const email = await this.emailModel.findById(id).exec();
      return { success: true, email };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Search endpoints

  @Get('search')
  async searchEmails(
    @Query('userId') userId: string,
    @Query('query') query: string,
    @Query('connectionId') connectionId?: string,
    @Query('folderPath') folderPath?: string,
    @Query('limit') limit?: number,
    @Query('skip') skip?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('hasAttachments') hasAttachments?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('subject') subject?: string,
  ) {
    try {
      const options: any = {
        limit: limit ? parseInt(limit.toString()) : 20,
        skip: skip ? parseInt(skip.toString()) : 0,
        connectionId,
        folderPath,
        from,
        to,
        subject,
      };

      if (startDate) {
        options.startDate = new Date(startDate);
      }

      if (endDate) {
        options.endDate = new Date(endDate);
      }

      if (hasAttachments !== undefined) {
        // Convert string 'true'/'false' to boolean if needed, or use boolean directly
        if (typeof hasAttachments === 'string') {
          options.hasAttachments = hasAttachments.toLowerCase() === 'true';
        } else {
          options.hasAttachments = !!hasAttachments;
        }
      }

      const result = await this.searchService.searchEmails(
        userId,
        query,
        options,
      );
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Analytics endpoints

  @Get('analytics')
  async getAnalytics(
    @Query('userId') userId: string,
    @Query('connectionId') connectionId?: string,
  ) {
    try {
      const analytics = await this.searchService.getEmailAnalytics(
        userId,
        connectionId,
      );
      return { success: true, analytics };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
