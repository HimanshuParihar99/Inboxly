import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ImapConnection, ImapConnectionDocument } from '../schemas/imap-connection.schema';
import Imap = require('imap');

@Injectable()
export class ImapConnectionsService {
  constructor(
    @InjectModel(ImapConnection.name)
    private imapConnectionModel: Model<ImapConnectionDocument>,
  ) {}

  async findAll(userId: string): Promise<ImapConnection[]> {
    return this.imapConnectionModel.find({ user: userId }).exec();
  }

  async findOne(id: string, userId: string): Promise<ImapConnection> {
    const connection = await this.imapConnectionModel
      .findOne({ _id: id, user: userId })
      .exec();

    if (!connection) {
      throw new NotFoundException(`Connection with ID ${id} not found`);
    }

    return connection;
  }

  async create(createConnectionDto: any, userId: string): Promise<ImapConnection> {
    // Test the connection before saving
    await this.testConnection(createConnectionDto);

    const newConnection = new this.imapConnectionModel({
      ...createConnectionDto,
      user: userId,
    });

    return newConnection.save();
  }

  async update(
    id: string,
    updateConnectionDto: any,
    userId: string,
  ): Promise<ImapConnection> {
    // If password is being updated, test the connection
    if (updateConnectionDto.password) {
      const connection = await this.findOne(id, userId);
      // Use type assertion to access toObject method from Mongoose document
      const connectionData = connection as any;
      await this.testConnection({
        ...(connectionData.toObject ? connectionData.toObject() : connection),
        ...updateConnectionDto,
      });
    }

    const updatedConnection = await this.imapConnectionModel
      .findOneAndUpdate({ _id: id, user: userId }, updateConnectionDto, {
        new: true,
      })
      .exec();

    if (!updatedConnection) {
      throw new NotFoundException(`Connection with ID ${id} not found`);
    }

    return updatedConnection;
  }

  async remove(id: string, userId: string): Promise<void> {
    const result = await this.imapConnectionModel
      .deleteOne({ _id: id, user: userId })
      .exec();

    if (result.deletedCount === 0) {
      throw new NotFoundException(`Connection with ID ${id} not found`);
    }
  }

  async testConnection(connectionConfig: any): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve, reject) => {
      const imap = new Imap({
        user: connectionConfig.username,
        password: connectionConfig.password,
        host: connectionConfig.host,
        port: connectionConfig.port,
        tls: connectionConfig.tls,
        tlsOptions: connectionConfig.tlsOptions || { rejectUnauthorized: false },
        authTimeout: 20000,
      });

      const timeout = setTimeout(() => {
        imap.end();
        reject(new BadRequestException('Connection timeout'));
      }, 30000);

      imap.once('ready', () => {
        clearTimeout(timeout);
        imap.end();
        resolve({ success: true, message: 'Connection successful' });
      });

      imap.once('error', (err) => {
        clearTimeout(timeout);
        imap.end();
        reject(
          new BadRequestException(
            `Connection failed: ${err.message || 'Unknown error'}`,
          ),
        );
      });

      imap.connect();
    });
  }

  async updateSyncStatus(
    id: string,
    status: 'syncing' | 'idle' | 'error',
    error?: string,
  ): Promise<ImapConnection> {
    const updateData: any = { syncStatus: status };
    
    if (error) {
      updateData.syncError = error;
    }
    
    if (status === 'idle') {
      updateData.lastSyncedAt = new Date();
    }

    const result = await this.imapConnectionModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .exec();
      
    if (!result) {
      throw new NotFoundException(`ImapConnection with id ${id} not found`);
    }
    
    return result;
  }

  async updateSyncProgress(
    id: string,
    totalEmails: number,
    syncedEmails: number,
  ): Promise<ImapConnection> {
    const result = await this.imapConnectionModel
      .findByIdAndUpdate(
        id,
        { totalEmails, syncedEmails },
        { new: true },
      )
      .exec();
      
    if (!result) {
      throw new NotFoundException(`ImapConnection with id ${id} not found`);
    }
    
    return result;
  }
}