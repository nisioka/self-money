import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { AnalyticsService } from './analytics.service.js';

interface AnalyticsRouteOptions {
  prisma: PrismaClient;
}

interface MonthlyQuerystring {
  year?: string;
  month?: string;
}

interface CategoriesQuerystring {
  year?: string;
  month?: string;
}

interface TrendQuerystring {
  months?: string;
}

export const analyticsRoutes: FastifyPluginAsync<AnalyticsRouteOptions> = async (
  fastify,
  options
) => {
  const service = new AnalyticsService(options.prisma);

  // GET /api/analytics/monthly - 月別収支サマリー
  fastify.get<{ Querystring: MonthlyQuerystring }>(
    '/api/analytics/monthly',
    async (request, reply) => {
      const { year: yearStr, month: monthStr } = request.query;

      let year: number;
      let month: number;

      if (yearStr === undefined && monthStr === undefined) {
        // パラメータなしの場合は現在の年月を使用
        const now = new Date();
        year = now.getFullYear();
        month = now.getMonth() + 1;
      } else if (yearStr === undefined || monthStr === undefined) {
        // どちらか一方だけ指定された場合はエラー
        return reply.status(400).send({ error: 'Both year and month are required' });
      } else {
        year = parseInt(yearStr, 10);
        month = parseInt(monthStr, 10);

        if (isNaN(year) || isNaN(month)) {
          return reply.status(400).send({ error: 'Invalid year or month' });
        }

        if (month < 1 || month > 12) {
          return reply.status(400).send({ error: 'Month must be between 1 and 12' });
        }
      }

      const summary = await service.getMonthlySummary(year, month);
      return summary;
    }
  );

  // GET /api/analytics/categories - 費目別支出内訳
  fastify.get<{ Querystring: CategoriesQuerystring }>(
    '/api/analytics/categories',
    async (request, reply) => {
      const { year: yearStr, month: monthStr } = request.query;

      let year: number;
      let month: number;

      if (yearStr === undefined && monthStr === undefined) {
        // パラメータなしの場合は現在の年月を使用
        const now = new Date();
        year = now.getFullYear();
        month = now.getMonth() + 1;
      } else if (yearStr === undefined || monthStr === undefined) {
        // どちらか一方だけ指定された場合はエラー
        return reply.status(400).send({ error: 'Both year and month are required' });
      } else {
        year = parseInt(yearStr, 10);
        month = parseInt(monthStr, 10);

        if (isNaN(year) || isNaN(month)) {
          return reply.status(400).send({ error: 'Invalid year or month' });
        }

        if (month < 1 || month > 12) {
          return reply.status(400).send({ error: 'Month must be between 1 and 12' });
        }
      }

      const breakdown = await service.getCategoryBreakdown(year, month);
      return breakdown;
    }
  );

  // GET /api/analytics/trend - 月別推移
  fastify.get<{ Querystring: TrendQuerystring }>(
    '/api/analytics/trend',
    async (request, reply) => {
      const { months: monthsStr } = request.query;

      let months = 6; // デフォルトは6ヶ月

      if (monthsStr !== undefined) {
        months = parseInt(monthsStr, 10);

        if (isNaN(months) || months <= 0) {
          return reply.status(400).send({ error: 'Months must be a positive number' });
        }
      }

      const trend = await service.getMonthlyTrend(months);
      return trend;
    }
  );
};
