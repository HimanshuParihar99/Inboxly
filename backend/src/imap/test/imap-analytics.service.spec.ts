import { Test, TestingModule } from '@nestjs/testing';
import { ImapAnalyticsService } from '../services/imap-analytics.service';
import { ImapConnectionsService } from '../services/imap-connections.service';
import { getModelToken } from '@nestjs/mongoose';
import { Connection } from '../schemas/connection.schema';
import { Email } from '../schemas/email.schema';
import { Model } from 'mongoose';

describe('ImapAnalyticsService', () => {
  let service: ImapAnalyticsService;
  let connectionsService: ImapConnectionsService;
  let emailModel: Model<Email>;
  let connectionModel: Model<Connection>;

  const mockConnectionsService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
  };

  const mockEmailModel = {
    countDocuments: jest.fn().mockReturnThis(),
    aggregate: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  };

  const mockConnectionModel = {
    find: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImapAnalyticsService,
        {
          provide: ImapConnectionsService,
          useValue: mockConnectionsService,
        },
        {
          provide: getModelToken('Email'),
          useValue: mockEmailModel,
        },
        {
          provide: getModelToken('Connection'),
          useValue: mockConnectionModel,
        },
      ],
    }).compile();

    service = module.get<ImapAnalyticsService>(ImapAnalyticsService);
    connectionsService = module.get<ImapConnectionsService>(ImapConnectionsService);
    emailModel = module.get<Model<Email>>(getModelToken('Email'));
    connectionModel = module.get<Model<Connection>>(getModelToken('Connection'));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUserAnalytics', () => {
    it('should return user analytics', async () => {
      // Mock data
      const userId = 'user123';
      const connections = [{ id: 'conn1' }, { id: 'conn2' }];
      const totalEmails = 100;
      const topSenders = [
        { domain: 'gmail.com', count: 50 },
        { domain: 'outlook.com', count: 30 },
      ];
      const emailsByDay = [
        { day: 'Monday', count: 20 },
        { day: 'Tuesday', count: 15 },
      ];

      // Setup mocks
      mockConnectionsService.findAll.mockResolvedValue(connections);
      mockEmailModel.countDocuments().exec.mockResolvedValueOnce(totalEmails);
      mockEmailModel.aggregate().exec.mockResolvedValueOnce(topSenders);
      mockEmailModel.aggregate().exec.mockResolvedValueOnce(emailsByDay);
      mockEmailModel.countDocuments().exec.mockResolvedValueOnce(80); // tlsEncrypted
      mockEmailModel.countDocuments().exec.mockResolvedValueOnce(20); // nonTls
      mockEmailModel.countDocuments().exec.mockResolvedValueOnce(5); // potentialPhishing

      // Call the method
      const result = await service.getUserAnalytics(userId);

      // Assertions
      expect(result).toBeDefined();
      expect(result.totalEmails).toBe(totalEmails);
      expect(result.connections).toBe(connections.length);
      expect(result.topSenders).toEqual(topSenders);
      expect(result.emailsByDay).toEqual(emailsByDay);
      expect(result.securityStats).toBeDefined();
      expect(result.securityStats.tlsEncrypted).toBe(80);
      expect(result.securityStats.nonTls).toBe(20);
      expect(result.securityStats.potentialPhishing).toBe(5);
    });

    it('should handle errors', async () => {
      // Mock data
      const userId = 'user123';
      const error = new Error('Test error');

      // Setup mocks
      mockConnectionsService.findAll.mockRejectedValue(error);

      // Call the method and expect it to throw
      await expect(service.getUserAnalytics(userId)).rejects.toThrow(error);
    });
  });

  describe('getConnectionAnalytics', () => {
    it('should return connection analytics', async () => {
      // Mock data
      const connectionId = 'conn123';
      const userId = 'user123';
      const totalEmails = 50;
      const topSenders = [
        { email: 'sender1@example.com', count: 20 },
        { email: 'sender2@example.com', count: 15 },
      ];
      const topDomains = [
        { domain: 'example.com', count: 30 },
        { domain: 'gmail.com', count: 20 },
      ];
      const emailsByMonth = [
        { month: 'Jan', count: 10 },
        { month: 'Feb', count: 15 },
      ];

      // Setup mocks
      mockConnectionsService.findOne.mockResolvedValue({ id: connectionId });
      mockEmailModel.countDocuments().exec.mockResolvedValueOnce(totalEmails);
      mockEmailModel.aggregate().exec.mockResolvedValueOnce(topSenders);
      mockEmailModel.aggregate().exec.mockResolvedValueOnce(topDomains);
      mockEmailModel.aggregate().exec.mockResolvedValueOnce(emailsByMonth);
      mockEmailModel.countDocuments().exec.mockResolvedValueOnce(40); // totalEmailsWithSecurity
      mockEmailModel.countDocuments().exec.mockResolvedValueOnce(35); // tlsCount
      mockEmailModel.countDocuments().exec.mockResolvedValueOnce(30); // spfPassCount
      mockEmailModel.countDocuments().exec.mockResolvedValueOnce(25); // dkimPassCount
      mockEmailModel.countDocuments().exec.mockResolvedValueOnce(20); // dmarcPassCount

      // Call the method
      const result = await service.getConnectionAnalytics(connectionId, userId);

      // Assertions
      expect(result).toBeDefined();
      expect(result.totalEmails).toBe(totalEmails);
      expect(result.topSenders).toEqual(topSenders);
      expect(result.topDomains).toEqual(topDomains);
      expect(result.emailsByMonth).toBeDefined();
      expect(result.securityAnalysis).toBeDefined();
      expect(result.securityAnalysis.tlsPercentage).toBe(88); // 35/40 * 100 = 87.5, rounded to 88
      expect(result.securityAnalysis.spfPassRate).toBe(75); // 30/40 * 100 = 75
      expect(result.securityAnalysis.dkimPassRate).toBe(63); // 25/40 * 100 = 62.5, rounded to 63
      expect(result.securityAnalysis.dmarcPassRate).toBe(50); // 20/40 * 100 = 50
    });

    it('should handle errors', async () => {
      // Mock data
      const connectionId = 'conn123';
      const userId = 'user123';
      const error = new Error('Test error');

      // Setup mocks
      mockConnectionsService.findOne.mockRejectedValue(error);

      // Call the method and expect it to throw
      await expect(service.getConnectionAnalytics(connectionId, userId)).rejects.toThrow(error);
    });
  });

  describe('analyzeServerSecurity', () => {
    it('should analyze server security', async () => {
      // Mock data
      const host = 'imap.gmail.com';
      const port = 993;

      // Call the method
      const result = await service.analyzeServerSecurity(host, port);

      // Assertions
      expect(result).toBeDefined();
      expect(result.host).toBe(host);
      expect(result.port).toBe(port);
      expect(result.tlsSupported).toBe(true);
      expect(result.certificateValid).toBe(true);
      expect(result.securityScore).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should handle invalid input', async () => {
      // Call the method with invalid input and expect it to throw
      await expect(service.analyzeServerSecurity('', 0)).rejects.toThrow();
    });
  });
});