import { Module } from '@nestjs/common';
import { ImapConnectionService } from './services/imap-connection.service';
import { ImapConnectionsService } from './services/imap-connections.service';
import { ImapSyncService } from './services/imap-sync.service';
import { EmailProcessorService } from './services/email-processor.service';
import { ImapController } from './controllers/imap.controller';
import { ImapConnectionsController } from './controllers/imap-connections.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailSchema } from './schemas/email.schema';
import { ConnectionSchema } from './schemas/connection.schema';
import { ImapConnectionSchema } from './schemas/imap-connection.schema';
import { SearchService } from './services/search.service';
import { ImapAnalyticsService } from './services/imap-analytics.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Email', schema: EmailSchema },
      { name: 'Connection', schema: ConnectionSchema },
      { name: 'ImapConnection', schema: ImapConnectionSchema },
    ]),
  ],
  controllers: [ImapController, ImapConnectionsController],
  providers: [
    ImapConnectionService,
    ImapConnectionsService,
    ImapSyncService,
    EmailProcessorService,
    SearchService,
    ImapAnalyticsService,
  ],
  exports: [
    ImapConnectionService,
    ImapConnectionsService,
    ImapSyncService,
    EmailProcessorService,
    SearchService,
    ImapAnalyticsService,
  ],
})
export class ImapModule {}