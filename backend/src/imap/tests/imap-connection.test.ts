import { Test, TestingModule } from '@nestjs/testing';
import { ImapConnectionService } from '../services/imap-connection.service';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

describe('ImapConnectionService', () => {
  let service: ImapConnectionService;
  let mockImapConnectionModel: any;
  
  beforeEach(async () => {
    mockImapConnectionModel = {
      findOne: jest.fn(),
      create: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImapConnectionService,
        {
          provide: getModelToken('ImapConnection'),
          useValue: mockImapConnectionModel,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(10), // Mock max connections
          },
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

    service = module.get<ImapConnectionService>(ImapConnectionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAvailableConnection', () => {
    it('should return an existing connection if available', async () => {
      const mockConnection = {
        id: 'connection-id',
        user: 'test@example.com',
        host: 'imap.example.com',
        imap: { state: 'authenticated' },
        lastActivity: new Date(),
        save: jest.fn(),
      };
      
      // Mock the connections map
      service['connections'] = new Map();
      service['connections'].set('test@example.com:imap.example.com', mockConnection);
      
      const result = await service.getAvailableConnection('test@example.com', 'imap.example.com', 'password');
      
      expect(result).toBe(mockConnection);
      expect(mockConnection.save).toHaveBeenCalled();
    });

    it('should create a new connection if none exists', async () => {
      const mockNewConnection = {
        id: 'new-connection-id',
        user: 'test@example.com',
        host: 'imap.example.com',
      };
      
      // Mock empty connections map
      service['connections'] = new Map();
      
      // Mock createConnection method
      jest.spyOn(service, 'createConnection').mockResolvedValue(mockNewConnection as any);
      
      const result = await service.getAvailableConnection('test@example.com', 'imap.example.com', 'password');
      
      expect(result).toBe(mockNewConnection);
      expect(service.createConnection).toHaveBeenCalledWith('test@example.com', 'imap.example.com', 'password');
    });
  });

  describe('checkConnectionHealth', () => {
    it('should attempt to reconnect disconnected connections', async () => {
      const mockDisconnectedConnection = {
        id: 'disconnected-id',
        user: 'test@example.com',
        host: 'imap.example.com',
        imap: { state: 'disconnected' },
        connect: jest.fn().mockResolvedValue(true),
      };
      
      const mockAuthenticatedConnection = {
        id: 'authenticated-id',
        user: 'other@example.com',
        host: 'imap.example.com',
        imap: { state: 'authenticated' },
      };
      
      // Mock connections map with both types
      service['connections'] = new Map();
      service['connections'].set('test@example.com:imap.example.com', mockDisconnectedConnection);
      service['connections'].set('other@example.com:imap.example.com', mockAuthenticatedConnection);
      
      await service.checkConnectionHealth();
      
      expect(mockDisconnectedConnection.connect).toHaveBeenCalled();
    });
  });
});