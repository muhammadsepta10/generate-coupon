import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Logger } from '@nestjs/common';

/**
 * Format seconds into human-readable string:
 * <60s  → "Xs"
 * <60m  → "Xm Ys"
 * <24h  → "Xh Ym"
 * <7d   → "Xd Yh"
 * <30d  → "Xw Yd"
 * <12mo → "Xmo Yd"
 * else  → "Xy Xmo"
 */
function formatEta(totalSeconds: number): string {
  if (totalSeconds <= 0) return '';
  const s = Math.round(totalSeconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return `${h}h ${rm}m`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  if (d < 7) return `${d}d ${rh}h`;
  if (d < 30) {
    const w = Math.floor(d / 7);
    const rd = d % 7;
    return `${w}w ${rd}d`;
  }
  if (d < 365) {
    const mo = Math.floor(d / 30);
    const rd = d % 30;
    return `${mo}mo ${rd}d`;
  }
  const y = Math.floor(d / 365);
  const rmo = Math.floor((d % 365) / 30);
  return `${y}y ${rmo}mo`;
}

export interface JobProgressPayload {
  jobId: string | number;
  parentJobId?: string;
  jobType: string;
  queue: string;
  processed: number;
  total: number;
  speed: number;
  pct: number;
  percentage: number;
  status: 'active' | 'completed' | 'failed' | 'waiting';
  message?: string;
  eta?: string;
  startedAt?: string;
  label?: string;
}

@WebSocketGateway({ cors: { origin: '*' } })
export class CouponGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(CouponGateway.name);

  @WebSocketServer()
  server: Server;

  /** In-memory tracking: parentJobId → aggregate counters for child queues */
  private readonly jobCounters = new Map<
    string,
    {
      total: number;
      completed: number;
      failed: number;
      startedAt: number;
      jobType: string;
      queue: string;
      label: string;
    }
  >();

  /** Throttle WS emits to max once per 500ms per parent job */
  private readonly emitTimers = new Map<string, NodeJS.Timeout>();
  private readonly pendingEmits = new Map<string, JobProgressPayload>();

  constructor(
    @InjectQueue('coupon2') private readonly couponQueue: Queue,
    @InjectQueue('bulk-qr') private readonly bulkQrQueue: Queue,
    @InjectQueue('generate-qr') private readonly generateQrQueue: Queue,
    @InjectQueue('post-process-qr') private readonly postProcessQrQueue: Queue,
    @InjectQueue('merge-image') private readonly mergeImageQueue: Queue,
  ) {}

  afterInit() {
    this.logger.log('WebSocket Gateway initialized');
    this._listenQueueEvents();
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    // Send currently tracked jobs to the new client
    for (const [key, counter] of this.jobCounters.entries()) {
      const pct =
        counter.total > 0
          ? Math.round((counter.completed / counter.total) * 100)
          : 0;
      const elapsed = (Date.now() - counter.startedAt) / 1000;
      const speed = elapsed > 0 ? Math.round(counter.completed / elapsed) : 0;
      client.emit('job:progress', {
        jobId: key,
        parentJobId: key,
        jobType: counter.jobType,
        queue: counter.queue,
        processed: counter.completed,
        total: counter.total,
        speed,
        pct,
        percentage: pct,
        status: counter.completed >= counter.total ? 'completed' : 'active',
        label: counter.label,
      } as JobProgressPayload);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('ping')
  handlePing(): string {
    return 'pong';
  }

  /** Called directly from processors that have access to this gateway */
  emitJobProgress(payload: JobProgressPayload) {
    this.server?.emit('job:progress', payload);
  }

  emitJobComplete(payload: Partial<JobProgressPayload>) {
    this.server?.emit('job:complete', {
      ...payload,
      status: 'completed',
      percentage: 100,
    });
    // Clean up counter after a delay
    if (payload.jobId) {
      setTimeout(() => {
        this.jobCounters.delete(String(payload.jobId));
      }, 30_000);
    }
  }

  emitJobFailed(payload: Partial<JobProgressPayload>) {
    this.server?.emit('job:failed', { ...payload, status: 'failed' });
    if (payload.jobId) {
      setTimeout(() => {
        this.jobCounters.delete(String(payload.jobId));
      }, 30_000);
    }
  }

  /**
   * Register a parent job that tracks child job completion counts.
   * Used by bulk-qr and post-process-qr processors.
   */
  registerParentJob(
    parentJobId: string | number,
    total: number,
    jobType: string,
    queue: string,
    label?: string,
  ) {
    const jobLabel = label || jobType;
    this.jobCounters.set(String(parentJobId), {
      total,
      completed: 0,
      failed: 0,
      startedAt: Date.now(),
      jobType,
      queue,
      label: jobLabel,
    });
    this.emitJobProgress({
      jobId: parentJobId,
      parentJobId: String(parentJobId),
      jobType,
      queue,
      processed: 0,
      total,
      pct: 0,
      speed: 0,
      percentage: 0,
      status: 'active',
      label: jobLabel,
    });
  }

  /**
   * Increment child completion count for a parent job.
   * Throttled: emits WS update at most once per 500ms to avoid flooding the browser.
   */
  incrementParentCounter(
    parentJobId: string | number,
    success: boolean = true,
  ) {
    const counter = this.jobCounters.get(String(parentJobId));
    if (!counter) return;

    if (success) {
      counter.completed++;
    } else {
      counter.failed++;
    }

    const done = counter.completed + counter.failed;
    const pct =
      counter.total > 0 ? Number(((done / counter.total) * 100).toFixed(1)) : 0;
    const elapsed = (Date.now() - counter.startedAt) / 1000;
    const speed = elapsed > 0 ? Math.round(counter.completed / elapsed) : 0;
    const eta =
      speed > 0
        ? formatEta(Math.round((counter.total - done) / speed))
        : 'calculating...';

    const payload: JobProgressPayload = {
      jobId: parentJobId,
      parentJobId: String(parentJobId),
      jobType: counter.jobType,
      queue: counter.queue,
      processed: counter.completed,
      total: counter.total,
      pct,
      speed,
      percentage: pct,
      status: done >= counter.total ? 'completed' : 'active',
      eta,
      label: counter.label,
    };

    // If completed, emit immediately
    if (done >= counter.total) {
      this._flushEmit(String(parentJobId));
      this.emitJobProgress(payload);
      this.emitJobComplete(payload);
      return;
    }

    // Throttle: store pending and schedule emit
    const key = String(parentJobId);
    this.pendingEmits.set(key, payload);
    if (!this.emitTimers.has(key)) {
      this.emitTimers.set(
        key,
        setTimeout(() => {
          this._flushEmit(key);
        }, 500),
      );
    }
  }

  private _flushEmit(key: string) {
    const timer = this.emitTimers.get(key);
    if (timer) clearTimeout(timer);
    this.emitTimers.delete(key);
    const pending = this.pendingEmits.get(key);
    if (pending) {
      this.pendingEmits.delete(key);
      this.emitJobProgress(pending);
    }
  }

  /** Listen to Bull queue events for high-concurrency child queues */
  private _listenQueueEvents() {
    // generate-qr queue: each completed job may have a parentJobId in data
    this.generateQrQueue.on('completed', (_job: any) => {
      const parentId = _job?.data?.parentJobId;
      if (parentId) {
        this.incrementParentCounter(parentId, true);
      }
    });
    this.generateQrQueue.on('failed', (_job: any) => {
      const parentId = _job?.data?.parentJobId;
      if (parentId) {
        this.incrementParentCounter(parentId, false);
      }
    });

    // merge-image queue: similarly track parent
    this.mergeImageQueue.on('completed', (_job: any) => {
      const parentId = _job?.data?.parentJobId;
      if (parentId) {
        this.incrementParentCounter(parentId, true);
      }
    });
    this.mergeImageQueue.on('failed', (_job: any) => {
      const parentId = _job?.data?.parentJobId;
      if (parentId) {
        this.incrementParentCounter(parentId, false);
      }
    });

    // bulk-qr progress → register parent job (from worker process)
    this.bulkQrQueue.on('progress', (_job: any, progress: any) => {
      if (progress?.type === 'register-parent') {
        this.registerParentJob(
          progress.parentJobId,
          progress.total,
          progress.jobType,
          progress.queue,
          progress.label,
        );
      }
    });

    // post-process-qr progress → register parent job (from worker process)
    this.postProcessQrQueue.on('progress', (_job: any, progress: any) => {
      if (progress?.type === 'register-parent') {
        this.registerParentJob(
          progress.parentJobId,
          progress.total,
          progress.jobType,
          progress.queue,
          progress.label,
        );
      }
    });

    // coupon2 queue progress → forward to WS clients (from worker process)
    this.couponQueue.on('progress', (_job: any, progress: any) => {
      if (progress?.jobId) {
        this.emitJobProgress(progress as JobProgressPayload);
      }
    });

    // coupon2 queue events
    this.couponQueue.on('completed', (job: any) => {
      this.emitJobComplete({
        jobId: job.id,
        jobType: 'generate-coupon',
        queue: 'coupon2',
      });
    });
    this.couponQueue.on('failed', (job: any, err: any) => {
      this.emitJobFailed({
        jobId: job.id,
        jobType: 'generate-coupon',
        queue: 'coupon2',
        message: err?.message,
      });
    });
  }

  /** Get all active job counters (for REST endpoint) */
  getActiveJobs(): JobProgressPayload[] {
    const results: JobProgressPayload[] = [];
    for (const [key, counter] of this.jobCounters.entries()) {
      const done = counter.completed + counter.failed;
      const pct =
        counter.total > 0 ? Math.round((done / counter.total) * 100) : 0;
      const elapsed = (Date.now() - counter.startedAt) / 1000;
      const speed = elapsed > 0 ? Math.round(counter.completed / elapsed) : 0;
      const remaining = counter.total - done;
      const etaSec = speed > 0 ? Math.round(remaining / speed) : 0;
      const eta = done >= counter.total ? '' : formatEta(etaSec);
      results.push({
        jobId: key,
        parentJobId: key,
        jobType: counter.jobType,
        queue: counter.queue,
        processed: counter.completed,
        total: counter.total,
        speed,
        pct,
        percentage: pct,
        status: done >= counter.total ? 'completed' : 'active',
        label: counter.label,
        eta,
      });
    }
    return results;
  }
}
