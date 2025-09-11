import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Email } from '../schemas/email.schema';

/**
 * Service for searching emails
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  
  constructor(
    @InjectModel('Email') private readonly emailModel: Model<Email>,
  ) {}
  
  /**
   * Search emails using full-text search
   * @param userId User ID
   * @param query Search query
   * @param options Search options
   * @returns Search results
   */
  async searchEmails(
    userId: string,
    query: string,
    options: {
      limit?: number;
      skip?: number;
      connectionId?: string;
      folderPath?: string;
      startDate?: Date;
      endDate?: Date;
      hasAttachments?: boolean;
      from?: string;
      to?: string;
      subject?: string;
    } = {},
  ) {
    try {
      const {
        limit = 20,
        skip = 0,
        connectionId,
        folderPath,
        startDate,
        endDate,
        hasAttachments,
        from,
        to,
        subject,
      } = options;
      
      // Build the search filter
      const filter: any = {};
      
      // Add text search if query is provided
      if (query && query.trim()) {
        filter.$text = { $search: query };
      }
      
      // Add additional filters
      if (connectionId) {
        filter.connectionId = connectionId;
      }
      
      if (folderPath) {
        filter.folderPath = folderPath;
      }
      
      // Date range filter
      if (startDate || endDate) {
        filter.date = {};
        if (startDate) {
          filter.date.$gte = startDate;
        }
        if (endDate) {
          filter.date.$lte = endDate;
        }
      }
      
      // Attachments filter
      if (hasAttachments !== undefined) {
        filter.hasAttachments = hasAttachments;
      }
      
      // From filter
      if (from) {
        filter['from.address'] = { $regex: from, $options: 'i' };
      }
      
      // To filter
      if (to) {
        filter['to.address'] = { $regex: to, $options: 'i' };
      }
      
      // Subject filter
      if (subject) {
        filter.subject = { $regex: subject, $options: 'i' };
      }
      
      // Execute the search query
      const emails = await this.emailModel
        .find(filter)
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .exec();
      
      // Get total count for pagination
      const total = await this.emailModel.countDocuments(filter).exec();
      
      return {
        emails,
        total,
        limit,
        skip,
      };
    } catch (error) {
      this.logger.error(`Search error: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get email analytics aggregations
   * @param userId User ID
   * @param connectionId Connection ID
   * @returns Analytics aggregations
   */
  async getEmailAnalytics(userId: string, connectionId?: string) {
    try {
      const filter: any = {};
      
      if (connectionId) {
        filter.connectionId = connectionId;
      }
      
      // Aggregate by sender domain
      const domainStats = await this.emailModel.aggregate([
        { $match: filter },
        { $group: {
          _id: '$analytics.senderDomain',
          count: { $sum: 1 },
          avgTimeDelta: { $avg: '$analytics.timeDelta' },
        }},
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]).exec();
      
      // Aggregate by ESP
      const espStats = await this.emailModel.aggregate([
        { $match: { ...filter, 'analytics.esp': { $exists: true } } },
        { $group: {
          _id: '$analytics.esp',
          count: { $sum: 1 },
        }},
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]).exec();
      
      // Aggregate by TLS support
      const tlsStats = await this.emailModel.aggregate([
        { $match: { ...filter, 'analytics.tlsSupport': { $exists: true } } },
        { $group: {
          _id: '$analytics.tlsSupport',
          count: { $sum: 1 },
        }},
      ]).exec();
      
      // Aggregate by certificate validity
      const certStats = await this.emailModel.aggregate([
        { $match: { ...filter, 'analytics.validCertificate': { $exists: true } } },
        { $group: {
          _id: '$analytics.validCertificate',
          count: { $sum: 1 },
        }},
      ]).exec();
      
      // Aggregate by open relay
      const relayStats = await this.emailModel.aggregate([
        { $match: { ...filter, 'analytics.openRelay': { $exists: true } } },
        { $group: {
          _id: '$analytics.openRelay',
          count: { $sum: 1 },
        }},
      ]).exec();
      
      return {
        domainStats,
        espStats,
        tlsStats,
        certStats,
        relayStats,
      };
    } catch (error) {
      this.logger.error(`Analytics error: ${error.message}`);
      throw error;
    }
  }
}