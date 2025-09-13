import { Test, TestingModule } from '@nestjs/testing';
import { FolderSyncService } from '../services/folder-sync.service';
import { ImapConnectionService } from '../services/imap-connection.service';
import { EmailProcessorService } from '../services/email-processor.service';
import { Logger } from '@nestjs/common';

describe('FolderSyncService', () => {
  let service: FolderSyncService;
  let mockImapConnectionService: any;
  let mockEmailProcessorService: any;
  
  beforeEach(async () => {
    mockImapConnectionService = {
      getConnection: jest.fn(),
    };

    mockEmailProcessorService = {
      processEmail: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FolderSyncService,
        {
          provide: ImapConnectionService,
          useValue: mockImapConnectionService,
        },
        {
          provide: EmailProcessorService,
          useValue: mockEmailProcessorService,
        },
        {
          provide: Logger,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<FolderSyncService>(FolderSyncService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('startSync', () => {
    it('should start folder synchronization', async () => {
      const mockConnection = {
        id: 'connection-id',
        user: 'test@example.com',
        host: 'imap.example.com',
        imap: {
          getBoxes: jest.fn().mockResolvedValue({
            INBOX: { attribs: [], children: {}, delimiter: '/' },
            Sent: { attribs: [], children: {}, delimiter: '/' },
          }),
          openBox: jest.fn().mockResolvedValue({
            name: 'INBOX',
            messages: { total: 10 },
          }),
          search: jest.fn().mockResolvedValue([1, 2, 3]),
          fetch: jest.fn().mockResolvedValue([
            { uid: 1, attrs: { uid: 1, flags: ['\\Seen'] } },
            { uid: 2, attrs: { uid: 2, flags: [] } },
            { uid: 3, attrs: { uid: 3, flags: ['\\Flagged'] } },
          ]),
        },
      };

      // Mock getConnection to return our mock connection
      mockImapConnectionService.getConnection.mockResolvedValue(mockConnection);

      // Mock processEmail to return analytics
      mockEmailProcessorService.processEmail.mockResolvedValue({
        messageId: 'test-id',
        senderDomain: 'example.com',
      });

      // Mock parseFolders method
      jest.spyOn(service as any, 'parseFolders').mockReturnValue([
        { path: 'INBOX', name: 'INBOX' },
        { path: 'Sent', name: 'Sent' },
      ]);

      // Mock syncFolder method
      jest.spyOn(service as any, 'syncFolder').mockResolvedValue(undefined);

      await service.startSync('user123', 'test@example.com', 'imap.example.com', 'password');

      // Verify connection was retrieved
      expect(mockImapConnectionService.getConnection).toHaveBeenCalledWith(
        'test@example.com',
        'imap.example.com',
        'password'
      );

      // Verify folders were parsed
      expect(service['parseFolders']).toHaveBeenCalled();

      // Verify syncFolder was called for each folder
      expect(service['syncFolder']).toHaveBeenCalled();
    });
  });

  describe('pauseSync', () => {
    it('should pause synchronization for a user', () => {
      // Set up active sync
      service['activeSyncs'].set('user123', { paused: false });

      service.pauseSync('user123');

      // Verify sync was paused
      expect(service['activeSyncs'].get('user123').paused).toBe(true);
    });
  });

  describe('resumeSync', () => {
    it('should resume synchronization for a user', () => {
      // Set up paused sync
      service['activeSyncs'].set('user123', { paused: true });

      service.resumeSync('user123');

      // Verify sync was resumed
      expect(service['activeSyncs'].get('user123').paused).toBe(false);
    });
  });
});