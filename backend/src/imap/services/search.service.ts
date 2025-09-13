import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery } from 'mongoose';
import { Email } from '../schemas/email.schema';

interface SearchOptions {
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
}

/**
 * Service for searching and aggregating email analytics.
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @InjectModel('Email') private readonly emailModel: Model<Email>,
  ) {}

  /**
   * Search emails with filters and full-text search.
   */
  async searchEmails(
    userId: string,
    query: string,
    options: SearchOptions = {},
  ): Promise<{
    emails: Email[];
    total: number;
    limit: number;
    skip: number;
  }> {
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

      const filter: FilterQuery<Email> = { userId };

      // Full-text search
      if (query?.trim()) {
        filter.$text = { $search: query.trim() };
      }

      // Additional filters
      if (connectionId) filter.connectionId = connectionId;
      if (folderPath) filter.folderPath = folderPath;

      if (startDate || endDate) {
        filter.date = {};
        if (startDate) filter.date.$gte = startDate;
        if (endDate) filter.date.$lte = endDate;
      }

      if (hasAttachments !== undefined) {
        filter.hasAttachments = hasAttachments;
      }

      if (from) {
        filter['from.address'] = { $regex: from, $options: 'i' };
      }

      if (to) {
        filter['to.address'] = { $regex: to, $options: 'i' };
      }

      if (subject) {
        filter.subject = { $regex: subject, $options: 'i' };
      }

      // Query execution
      const [emails, total] = await Promise.all([
        this.emailModel
          .find(filter)
          .sort({ date: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.emailModel.countDocuments(filter).exec(),
      ]);

      return { emails, total, limit, skip };
    } catch (error: any) {
      this.logger.error(`Search error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Aggregate analytics for user's emails.
   */
  async getEmailAnalytics(
    userId: string,
    connectionId?: string,
  ): Promise<{
    domainStats: any[];
    espStats: any[];
    tlsStats: any[];
    certStats: any[];
    relayStats: any[];
  }> {
    try {
      const filter: FilterQuery<Email> = { userId };
      if (connectionId) filter.connectionId = connectionId;

      const [domainStats, espStats, tlsStats, certStats, relayStats] =
        await Promise.all([
          this.emailModel.aggregate([
            { $match: filter },
            {
              $group: {
                _id: '$analytics.senderDomain',
                count: { $sum: 1 },
                avgTimeDelta: { $avg: '$analytics.timeDelta' },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 10 },
          ]),
          this.emailModel.aggregate([
            { $match: { ...filter, 'analytics.esp': { $exists: true } } },
            {
              $group: {
                _id: '$analytics.esp',
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 10 },
          ]),
          this.emailModel.aggregate([
            { $match: { ...filter, 'analytics.tlsSupport': { $exists: true } } },
            {
              $group: {
                _id: '$analytics.tlsSupport',
                count: { $sum: 1 },
              },
            },
          ]),
          this.emailModel.aggregate([
            { $match: { ...filter, 'analytics.validCertificate': { $exists: true } } },
            {
              $group: {
                _id: '$analytics.validCertificate',
                count: { $sum: 1 },
              },
            },
          ]),
          this.emailModel.aggregate([
            { $match: { ...filter, 'analytics.openRelay': { $exists: true } } },
            {
              $group: {
                _id: '$analytics.openRelay',
                count: { $sum: 1 },
              },
            },
          ]),
        ]);

      return { domainStats, espStats, tlsStats, certStats, relayStats };
    } catch (error: any) {
      this.logger.error(`Analytics error: ${error.message}`, error.stack);
      throw error;
    }
  }
}
