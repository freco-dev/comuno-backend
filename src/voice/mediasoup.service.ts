import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mediasoup from 'mediasoup';
import { Worker, Router, WebRtcTransport, PlainTransport, Producer, Consumer, DtlsParameters, RtpCapabilities, RtpParameters } from 'mediasoup';

interface TransportMeta {
  transport: WebRtcTransport;
  socketId: string;
  userId: string;
  groupId: string;
  direction: 'send' | 'recv';
}

@Injectable()
export class MediasoupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediasoupService.name);
  private worker: Worker | null = null;
  private router: Router | null = null;
  private transports = new Map<string, TransportMeta>();
  private producers = new Map<string, Producer>();
  private consumers = new Map<string, Consumer>();

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.initMediasoupWorker();
  }

  async onModuleDestroy() {
    if (this.router) {
      try {
        await this.router.close();
      } catch (error) {
        this.logger.error('Error closing mediasoup router', error);
      }
    }
    if (this.worker) {
      try {
        await this.worker.close();
      } catch (error) {
        this.logger.error('Error closing mediasoup worker', error);
      }
    }
  }

  private async initMediasoupWorker() {
    const listenIp = this.configService.get<string>('MEDIASOUP_LISTEN_IP') || '0.0.0.0';
    const announcedIp = this.configService.get<string>('MEDIASOUP_ANNOUNCED_IP') || undefined;

    this.worker = await mediasoup.createWorker({
      logLevel: 'warn',
      logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
      rtcMinPort: Number(this.configService.get('MEDIASOUP_MIN_PORT') || 10000),
      rtcMaxPort: Number(this.configService.get('MEDIASOUP_MAX_PORT') || 10100),
    });

    this.worker.on('died', () => {
      this.logger.error('Mediasoup worker died, exiting process');
      process.exit(1);
    });

    this.router = await this.worker.createRouter({
      mediaCodecs: [{
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
      }],
    });

    this.logger.log(`Mediasoup router created with id ${this.router.id}`);
  }

  getRtpCapabilities(): RtpCapabilities {
    if (!this.router) {
      throw new Error('Mediasoup router not initialized');
    }
    return this.router.rtpCapabilities;
  }

  async createWebRtcTransport(socketId: string, userId: string, groupId: string, direction: 'send' | 'recv') {
    if (!this.router) throw new Error('Mediasoup router not initialized');

    const listenIp = this.configService.get<string>('MEDIASOUP_LISTEN_IP') || '0.0.0.0';
    const announcedIp = this.configService.get<string>('MEDIASOUP_ANNOUNCED_IP');

    const transport = await this.router.createWebRtcTransport({
      listenIps: [{ ip: listenIp, announcedIp }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1000000,
    });

    this.transports.set(transport.id, {
      transport,
      socketId,
      userId,
      groupId,
      direction,
    });

    transport.on('dtlsstatechange', (dtlsState) => {
      if (dtlsState === 'closed') {
        this.logger.log(`Transport closed: ${transport.id}`);
        this.cleanupTransport(transport.id);
      }
    });

    transport.on('close', () => {
      this.logger.log(`Transport closed event: ${transport.id}`);
      this.cleanupTransport(transport.id);
    });

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async connectTransport(transportId: string, dtlsParameters: DtlsParameters) {
    const meta = this.transports.get(transportId);
    if (!meta) throw new Error(`Transport not found: ${transportId}`);
    await meta.transport.connect({ dtlsParameters });
    return { status: 'connected' };
  }

  async produce(
    transportId: string,
    kind: 'audio' | 'video',
    rtpParameters: RtpParameters,
    userId: string,
    groupId: string,
  ) {
    const meta = this.transports.get(transportId);
    if (!meta) throw new Error(`Transport not found: ${transportId}`);
    const producer = await meta.transport.produce({ kind, rtpParameters, appData: { userId, groupId } });
    const key = `${groupId}:${userId}`;
    this.producers.set(key, producer);

    producer.on('transportclose', () => {
      this.logger.log(`Producer transport closed: ${producer.id}`);
      this.producers.delete(key);
    });

    producer.on('close', () => {
      this.logger.log(`Producer closed: ${producer.id}`);
      this.producers.delete(key);
    });

    return { id: producer.id };
  }

  async consume(
    transportId: string,
    producerId: string,
    rtpCapabilities: RtpCapabilities,
    userId: string,
  ) {
    if (!this.router) throw new Error('Mediasoup router not initialized');
    const meta = this.transports.get(transportId);
    if (!meta) throw new Error(`Transport not found: ${transportId}`);

    const producer = Array.from(this.producers.values()).find((item) => item.id === producerId);
    if (!producer) {
      throw new Error(`Producer not found: ${producerId}`);
    }

    if (!this.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error('Cannot consume this producer with provided RTP capabilities');
    }

    const consumer = await meta.transport.consume({
      producerId,
      rtpCapabilities,
      paused: false,
      appData: { userId },
    });

    const consumerKey = `${transportId}:${consumer.id}`;
    this.consumers.set(consumerKey, consumer);

    consumer.on('transportclose', () => {
      this.logger.log(`Consumer transport closed: ${consumer.id}`);
      this.consumers.delete(consumerKey);
    });

    consumer.on('producerclose', () => {
      this.logger.log(`Producer closed for consumer: ${consumer.id}`);
      this.consumers.delete(consumerKey);
    });

    return {
      id: consumer.id,
      producerId: consumer.producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
      producerPaused: consumer.producerPaused,
    };
  }

  async closeProducer(groupId: string, userId: string) {
    const key = `${groupId}:${userId}`;
    const producer = this.producers.get(key);
    if (producer) {
      producer.close();
      this.producers.delete(key);
    }
  }

  async closeTransportsForSocket(socketId: string) {
    for (const [id, meta] of Array.from(this.transports.entries())) {
      if (meta.socketId === socketId) {
        meta.transport.close();
        this.transports.delete(id);
      }
    }
  }

  private cleanupTransport(transportId: string) {
    this.transports.delete(transportId);
  }
}
