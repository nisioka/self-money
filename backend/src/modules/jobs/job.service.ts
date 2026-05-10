import type { PrismaClient, Job } from '@prisma/client';

export type JobType = 'SCRAPE_ALL' | 'SCRAPE_SPECIFIC';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'waiting_for_otp';
export type OtpAuthMethod = 'TOTP' | 'SMS' | 'EMAIL' | 'PUSH_APPROVAL';

export type JobError = { type: 'NOT_FOUND' };

export type Result<T, E> =
  | { success: true; data: T }
  | { success: false; error: E };

// OTP timeout in milliseconds (5 minutes)
const OTP_TIMEOUT_MS = 5 * 60 * 1000;

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

  // OTP-related methods

  async setWaitingForOtp(
    id: string,
    authMethod: OtpAuthMethod
  ): Promise<Job> {
    return this.prisma.job.update({
      where: { id },
      data: {
        status: 'waiting_for_otp',
        otpAuthMethod: authMethod,
        otpRequestedAt: new Date(),
        otpRetryCount: 0,
      },
    });
  }

  async incrementOtpRetryCount(id: string): Promise<Job> {
    return this.prisma.job.update({
      where: { id },
      data: {
        otpRetryCount: { increment: 1 },
      },
    });
  }

  async getWaitingForOtpJobs(): Promise<Job[]> {
    return this.prisma.job.findMany({
      where: { status: 'waiting_for_otp' },
      orderBy: { otpRequestedAt: 'asc' },
    });
  }

  async recoverStaleOtpJobs(): Promise<number> {
    // updateMany で 1 リクエストにまとめる。失効した OTP 待機ジョブが
    // 大量にある場合でも DB ラウンドトリップは 1 回で済む。
    const result = await this.prisma.job.updateMany({
      where: {
        status: 'waiting_for_otp',
        otpRequestedAt: {
          lt: new Date(Date.now() - OTP_TIMEOUT_MS),
        },
      },
      data: {
        status: 'failed',
        errorMessage: 'OTP timeout',
      },
    });

    if (result.count > 0) {
      console.log(`[JOB_SERVICE] Recovered ${result.count} stale OTP jobs`);
    }
    return result.count;
  }

  isOtpTimedOut(job: Job): boolean {
    if (job.status !== 'waiting_for_otp' || !job.otpRequestedAt) {
      return false;
    }
    return Date.now() - job.otpRequestedAt.getTime() > OTP_TIMEOUT_MS;
  }

  getRemainingOtpSeconds(job: Job): number {
    if (job.status !== 'waiting_for_otp' || !job.otpRequestedAt) {
      return 0;
    }
    const elapsed = Date.now() - job.otpRequestedAt.getTime();
    const remaining = OTP_TIMEOUT_MS - elapsed;
    return Math.max(0, Math.floor(remaining / 1000));
  }
}
