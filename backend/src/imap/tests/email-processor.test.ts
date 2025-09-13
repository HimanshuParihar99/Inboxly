import { Test, TestingModule } from '@nestjs/testing';
import { EmailProcessorService } from '../services/email-processor.service';
import { getModelToken } from '@nestjs/mongoose';
import { Logger } from '@nestjs/common';

describe('EmailProcessorService', () => {
  let service: EmailProcessorService;
  let mockEmailIndexModel: any;
  let mockEmailAnalyticsModel: any;
  
  beforeEach(async () => {
    mockEmailIndexModel = {
      findOne: jest.fn(),
      create: jest.fn(),
    };

    mockEmailAnalyticsModel = {
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailProcessorService,
        {
          provide: getModelToken('EmailIndex'),
          useValue: mockEmailIndexModel,
        },
        {
          provide: getModelToken('EmailAnalytics'),
          useValue: mockEmailAnalyticsModel,
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

    service = module.get<EmailProcessorService>(EmailProcessorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processEmail', () => {
    it('should process an email and return analytics', async () => {
      const mockMessage = {
        messageId: '<test123@example.com>',
        from: { text: 'Test User <test@example.com>' },
        subject: 'Test Subject',
        date: new Date(),
        to: { text: 'recipient@example.com' },
        cc: { text: '' },
        bcc: { text: '' },
        attachments: [],
        html: '<p>Test content</p>',
        text: 'Test content',
      };

      // Mock DNS and TLS check methods
      jest.spyOn(service as any, 'checkOpenRelay').mockResolvedValue(false);
      jest.spyOn(service as any, 'checkTlsSupport').mockResolvedValue(true);
      jest.spyOn(service as any, 'detectEsp').mockReturnValue('gmail');
      
      // Mock indexEmailForSearch method
      jest.spyOn(service, 'indexEmailForSearch').mockResolvedValue(undefined);

      const result = await service.processEmail(
        mockMessage as any,
        'user123',
        'connection456',
        'INBOX'
      );

      expect(result).toBeDefined();
      expect(result.messageId).toBe('<test123@example.com>');
      expect(result.senderDomain).toBe('example.com');
      expect(result.esp).toBe('gmail');
      expect(service.indexEmailForSearch).toHaveBeenCalledWith(
        mockMessage,
        'user123',
        'connection456',
        'INBOX'
      );
      expect(mockEmailAnalyticsModel.create).toHaveBeenCalled();
    });

    it('should handle errors during processing', async () => {
      const mockMessage = {
        messageId: '<test123@example.com>',
        from: { text: 'Test User <test@example.com>' },
        subject: 'Test Subject',
      };

      // Force an error during processing
      jest.spyOn(service as any, 'checkOpenRelay').mockRejectedValue(new Error('DNS error'));

      const result = await service.processEmail(
        mockMessage as any,
        'user123',
        'connection456',
        'INBOX'
      );

      // Should still return partial analytics
      expect(result).toBeDefined();
      expect(result.messageId).toBe('<test123@example.com>');
      expect(result.senderDomain).toBe('example.com');
    });
  });

  describe('searchEmails', () => {
    it('should search emails with the provided criteria', async () => {
      const mockSearchResults = {
        docs: [
          { messageId: 'msg1', subject: 'Test 1' },
          { messageId: 'msg2', subject: 'Test 2' },
        ],
        totalDocs: 2,
        limit: 10,
        page: 1,
        totalPages: 1,
        pagingCounter: 1,
        hasPrevPage: false,
        hasNextPage: false,
        prevPage: null,
        nextPage: null,
      };

      // Mock the aggregate and paginate methods
      mockEmailIndexModel.aggregate = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSearchResults),
      });

      const result = await service.searchEmails('user123', {
        searchText: 'test',
        page: 1,
        limit: 10,
      });

      expect(result).toBeDefined();
      expect(result.results).toEqual(mockSearchResults.docs);
      expect(result.total).toBe(2);
      expect(mockEmailIndexModel.aggregate).toHaveBeenCalled();
    });
  });
});