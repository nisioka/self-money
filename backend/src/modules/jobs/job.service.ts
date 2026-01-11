import type { PrismaClient, Job } from '@prisma/client';

export type JobType = 'SCRAPE_ALL' | 'SCRAPE_SPECIFIC';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export type JobError = { type: 'NOT_FOUND' };

export type Result<T, E> =
  | { success: true; data: T }
  | { success: false; error: E };

export class JobService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(type: JobType, targetAccountId?: number): Promise<Job> {
    return this.prisma.job.create({
      data: {
        type,
        status: 'pending',
        targetAccountId: targetAccountId ?? null,
      },
    });
  }

  async getById(id: string): Promise<Result<Job, JobError>> {
    const job = await this.prisma.job.findUnique({
      where: { id },
    });

    if (!job) {
      return { success: false, error: { type: 'NOT_FOUND' } };
    }

    return { success: true, data: job };
  }

  async getNextPending(): Promise<Job | null> {
    return this.prisma.job.findFirst({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });
  }

  async hasRunningJob(): Promise<boolean> {
    const runningJob = await this.prisma.job.findFirst({
      where: { status: 'running' },
    });
    return runningJob !== null;
  }

  async updateStatus(
    id: string,
    status: JobStatus,
    errorMessage?: string
  ): Promise<Job> {
    return this.prisma.job.update({
      where: { id },
      data: {
        status,
        errorMessage: errorMessage ?? null,
      },
    });
  }

  async getRecent(limit: number): Promise<Job[]> {
    return this.prisma.job.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
