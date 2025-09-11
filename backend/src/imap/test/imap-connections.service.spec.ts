import { Test, TestingModule } from '@nestjs/testing';
import { ImapConnectionsService } from '../services/imap-connections.service';
import { ImapConnectionService } from '../services/imap-connection.service';
import { getModelToken } from '@nestjs/mongoose';
import { Connection } from '../schemas/connection.schema';
import { Model } from 'mongoose';
import { NotFoundException } from '@nestjs/common';

describe('ImapConnectionsService', () => {
  let service: ImapConnectionsService;
  let connectionService: ImapConnectionService;
  let connectionModel: Model<Connection>;

  const mockConnectionService = {
    testConnection: jest.fn(),
    getFolders: jest.fn(),
  };

  const mockConnectionModel = {
    find: jest.fn().mockReturnThis(),
    findOne: jest.fn().mockReturnThis(),
    findById: jest.fn().mockReturnThis(),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn().mockReturnThis(),
    findByIdAndDelete: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImapConnectionsService,
        {
          provide: ImapConnectionService,
          useValue: mockConnectionService,
        },
        {
          provide: getModelToken('Connection'),
          useValue: mockConnectionModel,
        },
      ],
    }).compile();

    service = module.get<ImapConnectionsService>(ImapConnectionsService);
    connectionService = module.get<ImapConnectionService>(ImapConnectionService);
    connectionModel = module.get<Model<Connection>>(getModelToken('Connection'));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all connections for a user', async () => {
      // Mock data
      const userId = 'user123';
      const connections = [
        { _id: 'conn1', userId, host: 'imap.example.com' },
        { _id: 'conn2', userId, host: 'imap.test.com' },
      ];

      // Setup mocks
      mockConnectionModel.find().exec.mockResolvedValue(connections);

      // Call the method
      const result = await service.findAll(userId);

      // Assertions
      expect(result).toEqual(connections);
      expect(mockConnectionModel.find).toHaveBeenCalledWith({ userId });
    });
  });

  describe('findOne', () => {
    it('should return a connection by id', async () => {
      // Mock data
      const id = 'conn123';
      const userId = 'user123';
      const connection = { _id: id, userId, host: 'imap.example.com' };

      // Setup mocks
      mockConnectionModel.findOne().exec.mockResolvedValue(connection);

      // Call the method
      const result = await service.findOne(id, userId);

      // Assertions
      expect(result).toEqual(connection);
      expect(mockConnectionModel.findOne).toHaveBeenCalledWith({ _id: id, userId });
    });

    it('should throw NotFoundException if connection not found', async () => {
      // Mock data
      const id = 'conn123';
      const userId = 'user123';

      // Setup mocks
      mockConnectionModel.findOne().exec.mockResolvedValue(null);

      // Call the method and expect it to throw
      await expect(service.findOne(id, userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a new connection', async () => {
      // Mock data
      const userId = 'user123';
      const createConnectionDto = {
        host: 'imap.example.com',
        port: 993,
        username: 'test@example.com',
        password: 'password',
        tls: true,
      };
      const newConnection = {
        _id: 'conn123',
        userId,
        ...createConnectionDto,
      };

      // Setup mocks
      mockConnectionService.testConnection.mockResolvedValue(true);
      mockConnectionModel.create.mockResolvedValue(newConnection);

      // Call the method
      const result = await service.create(createConnectionDto, userId);

      // Assertions
      expect(result).toEqual(newConnection);
      expect(mockConnectionService.testConnection).toHaveBeenCalledWith({
        ...createConnectionDto,
        userId,
      });
      expect(mockConnectionModel.create).toHaveBeenCalledWith({
        ...createConnectionDto,
        userId,
      });
    });

    it('should throw error if connection test fails', async () => {
      // Mock data
      const userId = 'user123';
      const createConnectionDto = {
        host: 'imap.example.com',
        port: 993,
        username: 'test@example.com',
        password: 'password',
        tls: true,
      };
      const error = new Error('Connection test failed');

      // Setup mocks
      mockConnectionService.testConnection.mockRejectedValue(error);

      // Call the method and expect it to throw
      await expect(service.create(createConnectionDto, userId)).rejects.toThrow(error);
    });
  });

  describe('update', () => {
    it('should update a connection', async () => {
      // Mock data
      const id = 'conn123';
      const userId = 'user123';
      const updateConnectionDto = {
        host: 'imap.updated.com',
        port: 993,
      };
      const existingConnection = {
        _id: id,
        userId,
        host: 'imap.example.com',
        port: 993,
        username: 'test@example.com',
        password: 'password',
        tls: true,
      };
      const updatedConnection = {
        ...existingConnection,
        ...updateConnectionDto,
      };

      // Setup mocks
      mockConnectionModel.findOne().exec.mockResolvedValue(existingConnection);
      mockConnectionService.testConnection.mockResolvedValue(true);
      mockConnectionModel.findByIdAndUpdate().exec.mockResolvedValue(updatedConnection);

      // Call the method
      const result = await service.update(id, updateConnectionDto, userId);

      // Assertions
      expect(result).toEqual(updatedConnection);
      expect(mockConnectionModel.findOne).toHaveBeenCalledWith({ _id: id, userId });
      expect(mockConnectionService.testConnection).toHaveBeenCalledWith({
        ...existingConnection,
        ...updateConnectionDto,
      });
      expect(mockConnectionModel.findByIdAndUpdate).toHaveBeenCalledWith(
        id,
        updateConnectionDto,
        { new: true },
      );
    });

    it('should throw NotFoundException if connection not found', async () => {
      // Mock data
      const id = 'conn123';
      const userId = 'user123';
      const updateConnectionDto = {
        host: 'imap.updated.com',
      };

      // Setup mocks
      mockConnectionModel.findOne().exec.mockResolvedValue(null);

      // Call the method and expect it to throw
      await expect(service.update(id, updateConnectionDto, userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should remove a connection', async () => {
      // Mock data
      const id = 'conn123';
      const userId = 'user123';
      const connection = {
        _id: id,
        userId,
        host: 'imap.example.com',
      };

      // Setup mocks
      mockConnectionModel.findByIdAndDelete().exec.mockResolvedValue(connection);

      // Call the method
      const result = await service.remove(id, userId);

      // Assertions
      expect(result).toEqual(connection);
      expect(mockConnectionModel.findByIdAndDelete).toHaveBeenCalledWith({
        _id: id,
        userId,
      });
    });

    it('should throw NotFoundException if connection not found', async () => {
      // Mock data
      const id = 'conn123';
      const userId = 'user123';

      // Setup mocks
      mockConnectionModel.findByIdAndDelete().exec.mockResolvedValue(null);

      // Call the method and expect it to throw
      await expect(service.remove(id, userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('testConnection', () => {
    it('should test a connection successfully', async () => {
      // Mock data
      const connectionDto = {
        host: 'imap.example.com',
        port: 993,
        username: 'test@example.com',
        password: 'password',
        tls: true,
      };

      // Setup mocks
      mockConnectionService.testConnection.mockResolvedValue(true);

      // Call the method
      const result = await service.testConnection(connectionDto);

      // Assertions
      expect(result).toEqual({ success: true });
      expect(mockConnectionService.testConnection).toHaveBeenCalledWith(connectionDto);
    });

    it('should handle connection test failure', async () => {
      // Mock data
      const connectionDto = {
        host: 'imap.example.com',
        port: 993,
        username: 'test@example.com',
        password: 'password',
        tls: true,
      };
      const error = new Error('Connection test failed');

      // Setup mocks
      mockConnectionService.testConnection.mockRejectedValue(error);

      // Call the method
      const result = await service.testConnection(connectionDto);

      // Assertions
      expect(result).toEqual({
        success: false,
        error: error.message,
      });
    });
  });

  describe('getFolders', () => {
    it('should get folders for a connection', async () => {
      // Mock data
      const id = 'conn123';
      const userId = 'user123';
      const connection = {
        _id: id,
        userId,
        host: 'imap.example.com',
      };
      const folders = [
        { name: 'INBOX', path: 'INBOX' },
        { name: 'Sent', path: 'Sent' },
      ];

      // Setup mocks
      mockConnectionModel.findOne().exec.mockResolvedValue(connection);
      mockConnectionService.getFolders.mockResolvedValue(folders);

      // Call the method
      const result = await service.getFolders(id, userId);

      // Assertions
      expect(result).toEqual(folders);
      expect(mockConnectionModel.findOne).toHaveBeenCalledWith({ _id: id, userId });
      expect(mockConnectionService.getFolders).toHaveBeenCalledWith(connection);
    });

    it('should throw NotFoundException if connection not found', async () => {
      // Mock data
      const id = 'conn123';
      const userId = 'user123';

      // Setup mocks
      mockConnectionModel.findOne().exec.mockResolvedValue(null);

      // Call the method and expect it to throw
      await expect(service.getFolders(id, userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateSyncStatus', () => {
    it('should update sync status for a connection', async () => {
      // Mock data
      const id = 'conn123';
      const syncStatus = 'syncing';
      const error = null;
      const updatedConnection = {
        _id: id,
        syncStatus,
        syncError: error,
      };

      // Setup mocks
      mockConnectionModel.findByIdAndUpdate().exec.mockResolvedValue(updatedConnection);

      // Call the method
      const result = await service.updateSyncStatus(id, syncStatus, error);

      // Assertions
      expect(result).toEqual(updatedConnection);
      expect(mockConnectionModel.findByIdAndUpdate).toHaveBeenCalledWith(
        id,
        { syncStatus, syncError: error },
        { new: true },
      );
    });
  });

  describe('updateSyncProgress', () => {
    it('should update sync progress for a connection', async () => {
      // Mock data
      const id = 'conn123';
      const totalEmails = 100;
      const syncedEmails = 50;
      const updatedConnection = {
        _id: id,
        totalEmails,
        syncedEmails,
      };

      // Setup mocks
      mockConnectionModel.findByIdAndUpdate().exec.mockResolvedValue(updatedConnection);

      // Call the method
      const result = await service.updateSyncProgress(id, totalEmails, syncedEmails);

      // Assertions
      expect(result).toEqual(updatedConnection);
      expect(mockConnectionModel.findByIdAndUpdate).toHaveBeenCalledWith(
        id,
        { totalEmails, syncedEmails },
        { new: true },
      );
    });
  });
});