import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { prisma } from '../../lib/prisma.js';
import { waManager, WAEvent } from '../../lib/whatsapp.js';
import { instanceTokenMiddleware } from '../../middlewares/auth.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import * as fs from 'fs';
import * as path from 'path';

// Helper to ensure media directory exists
const MEDIA_DIR = path.join(process.cwd(), 'public', 'media');
if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

async function handleMediaDownload(instanceId: string, messageId: string, type: string, mimetype: string) {
    try {
        const buffer = await waManager.downloadMedia(instanceId, messageId, {});
        const ext = mimetype.split('/')[1] || 'bin';
        const fileName = `${messageId}.${ext}`;
        const filePath = path.join(MEDIA_DIR, fileName);

        await fs.promises.writeFile(filePath, buffer);
        logger.info({ messageId, filePath }, 'Media downloaded and saved');

        // Update message with local path
        // We need to wait for message creation first, or update it after
        // Since this runs in background, we can update DB here
        await prisma.message.update({
            where: { waMessageId: messageId },
            data: { mediaUrl: `/media/${fileName}` }
        });

    } catch (error) {
        logger.error({ messageId, error }, 'Failed to auto-download media');
    }
}

const webhooks = new Hono();


// ================================
// Webhook Service
// ================================

interface WebhookPayload {
    event: string;
    instanceId: string;
    timestamp: string;
    data: any;
}

async function sendWebhook(url: string, payload: WebhookPayload): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), env.webhookTimeout);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'WhatsApp-API-Webhook/1.0',
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
            logger.warn({ url, status: response.status }, 'Webhook returned non-2xx status');
            return false;
        }

        return true;
    } catch (error) {
        logger.error({ url, error }, 'Failed to send webhook');
        return false;
    }
}

async function sendWebhookWithRetry(url: string, payload: WebhookPayload): Promise<void> {
    for (let attempt = 1; attempt <= env.webhookRetryAttempts; attempt++) {
        const success = await sendWebhook(url, payload);
        if (success) return;

        if (attempt < env.webhookRetryAttempts) {
            // Exponential backoff: 1s, 2s, 4s, etc.
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
        }
    }
}

async function dispatchWebhook(instanceId: string, event: string, data: any): Promise<void> {
    const payload: WebhookPayload = {
        event,
        instanceId,
        timestamp: new Date().toISOString(),
        data,
    };

    logger.info({ instanceId, event }, 'Dispatching webhook');

    // Get instance webhook config
    const instance = await prisma.instance.findUnique({
        where: { id: instanceId },
        select: {
            webhookUrl: true,
            webhookEvents: true,
        },
    });

    logger.info({
        instanceId,
        webhookUrl: instance?.webhookUrl,
        webhookEvents: instance?.webhookEvents
    }, 'Instance webhook config');

    // Get global webhook config
    const globalSettings = await prisma.globalSettings.findUnique({
        where: { id: 'global' },
    });

    // Send to instance webhook if configured
    if (instance?.webhookUrl) {
        const events = instance.webhookEvents;
        if (events.length === 0 || events.includes(event) || events.includes('*')) {
            logger.info({ url: instance.webhookUrl, event }, 'Sending webhook to instance URL');
            sendWebhookWithRetry(instance.webhookUrl, payload);
        } else {
            logger.info({ event, configuredEvents: events }, 'Event not in configured events');
        }
    } else {
        logger.info({ instanceId }, 'No webhook URL configured for instance');
    }

    // Send to global webhook if configured
    if (globalSettings?.webhookUrl) {
        const events = globalSettings.webhookEvents;
        if (events.length === 0 || events.includes(event) || events.includes('*')) {
            sendWebhookWithRetry(globalSettings.webhookUrl, payload);
        }
    }
}

// ================================
// Setup Event Listeners
// ================================

export function setupWebhookListeners(): void {
    const events: WAEvent[] = [
        'qr',
        'ready',
        'authenticated',
        'auth_failure',
        'disconnected',
        'message',
        'message_create',
        'message_ack',
        'message_revoke_everyone',
        'group_join',
        'group_leave',
        'group_update',
        'call',
    ];

    for (const event of events) {
        waManager.on(event, (data) => {
            dispatchWebhook(data.instanceId, event, data);
        });
    }

    logger.info('Webhook listeners setup complete');
}

// ================================
// SSE Connections Store
// ================================

const sseConnections = new Map<string, Set<WritableStreamDefaultWriter>>();

export function broadcastSSE(instanceId: string, event: string, data: any): void {
    const connections = sseConnections.get(instanceId);
    if (!connections) return;

    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const encoder = new TextEncoder();
    const chunk = encoder.encode(message);

    for (const writer of connections) {
        try {
            writer.write(chunk);
        } catch (error) {
            // Connection closed, will be cleaned up
        }
    }
}

// ================================
// Routes
// ================================

/**
 * GET /sse/:instanceId
 * Server-Sent Events stream for real-time updates
 */
webhooks.get('/sse/:instanceId', instanceTokenMiddleware, async (c) => {
    const instanceId = c.get('instanceId');

    return streamSSE(c, async (stream) => {
        // Send initial status
        const status = waManager.getStatus(instanceId);
        await stream.writeSSE({
            event: 'status',
            data: JSON.stringify({ status }),
        });

        // Setup event handlers
        const handlers = new Map<string, (data: any) => void>();

        const events: WAEvent[] = [
            'qr',
            'ready',
            'authenticated',
            'auth_failure',
            'disconnected',
            'message',
            'message_create',
            'message_ack',
            'message_revoke_everyone',
            'group_join',
            'group_leave',
            'group_update',
            'call',
        ];

        for (const event of events) {
            const handler = (data: any) => {
                if (data.instanceId === instanceId) {
                    stream.writeSSE({
                        event,
                        data: JSON.stringify(data),
                    });
                }
            };
            handlers.set(event, handler);
            waManager.on(event, handler);
        }

        // Keep connection alive
        const keepAlive = setInterval(() => {
            stream.writeSSE({
                event: 'ping',
                data: JSON.stringify({ timestamp: Date.now() }),
            });
        }, 30000);

        // Wait for close
        try {
            while (true) {
                await stream.sleep(60000);
            }
        } finally {
            // Cleanup
            clearInterval(keepAlive);
            for (const [event, handler] of handlers) {
                waManager.off(event, handler);
            }
        }
    });
});

/**
 * GET /webhook/events
 * List available webhook events
 */
webhooks.get('/events', async (c) => {
    const events = [
        { name: 'qr', description: 'QR code generated for connection' },
        { name: 'ready', description: 'WhatsApp connected and ready' },
        { name: 'authenticated', description: 'Authentication successful' },
        { name: 'auth_failure', description: 'Authentication failed' },
        { name: 'disconnected', description: 'WhatsApp disconnected' },
        { name: 'message', description: 'New message received' },
        { name: 'message_create', description: 'Message created (sent or received)' },
        { name: 'message_ack', description: 'Message acknowledgement (delivered, read)' },
        { name: 'message_revoke_everyone', description: 'Message deleted for everyone' },
        { name: 'group_join', description: 'Someone joined a group' },
        { name: 'group_leave', description: 'Someone left a group' },
        { name: 'group_update', description: 'Group settings updated' },
        { name: 'call', description: 'Incoming call' },
        { name: '*', description: 'All events (wildcard)' },
    ];

    return c.json({
        success: true,
        data: events,
    });
});

/**
 * GET /webhook
 * Meta Webhook Verification
 */
webhooks.get('/', (c) => {
    const mode = c.req.query('hub.mode');
    const token = c.req.query('hub.verify_token');
    const challenge = c.req.query('hub.challenge');

    // Use ADMIN_TOKEN as verify token by default
    if (mode === 'subscribe' && token === env.adminToken) {
        logger.info('Webhook verified successfully');
        return c.text(challenge || '');
    }

    logger.warn({ mode, token }, 'Webhook verification failed');
    return c.json({ error: 'Forbidden' }, 403);
});

/**
 * POST /webhook
 * Meta Webhook Event Receiver
 */
webhooks.post('/', async (c) => {
    try {
        const body = await c.req.json();

        // Basic logging
        // logger.info({ body }, 'Received webhook event');

        // Handle entries
        // Handle entries
        if (body.object === 'whatsapp_business_account') {
            for (const entry of body.entry || []) {
                for (const change of entry.changes || []) {
                    const value = change.value;
                    const metadata = value.metadata;

                    if (value.messages) {
                        for (const message of value.messages) {
                            if (metadata && metadata.phone_number_id) {
                                const instance = await prisma.instance.findFirst({
                                    where: { waPhoneNumberId: metadata.phone_number_id }
                                });

                                if (instance) {
                                    // 1. Upsert Contact
                                    const from = message.from;
                                    const pushName = value.contacts?.find((c: any) => c.wa_id === from)?.profile?.name;

                                    let contact = await prisma.contact.findUnique({
                                        where: { instanceId_waId: { instanceId: instance.id, waId: from } }
                                    });

                                    if (!contact) {
                                        contact = await prisma.contact.create({
                                            data: {
                                                instanceId: instance.id,
                                                waId: from,
                                                pushName: pushName || from,
                                            }
                                        });
                                    } else if (pushName && contact.pushName !== pushName) {
                                        // Update name if changed
                                        await prisma.contact.update({
                                            where: { id: contact.id },
                                            data: { pushName }
                                        });
                                    }

                                    // 2. Persist Message
                                    let bodyText = '';
                                    let mediaUrl = '';
                                    let mediaType = message.type;

                                    if (message.type === 'text') {
                                        bodyText = message.text?.body;
                                    } else if (message.type === 'image') {
                                        bodyText = message.image?.caption;
                                        mediaUrl = message.image?.id; // Store ID initially, or download
                                    } else if (message.type === 'video') {
                                        bodyText = message.video?.caption;
                                        mediaUrl = message.video?.id;
                                    } else if (message.type === 'audio') {
                                        mediaUrl = message.audio?.id;
                                    } else if (message.type === 'document') {
                                        bodyText = message.document?.caption;
                                        mediaUrl = message.document?.id;
                                    }

                                    // Check if message already exists (deduplication)
                                    const existingMessage = await prisma.message.findUnique({
                                        where: { waMessageId: message.id }
                                    });

                                    if (!existingMessage) {
                                        await prisma.message.create({
                                            data: {
                                                instanceId: instance.id,
                                                contactId: contact.id,
                                                waMessageId: message.id,
                                                from: from,
                                                to: metadata.display_phone_number,
                                                direction: 'INBOUND',
                                                // type: message.type, // Removed from schema
                                                body: bodyText,
                                                mediaUrl: mediaUrl,
                                                mediaType: mediaType,
                                                status: 'DELIVERED',
                                                sentAt: new Date(Number(message.timestamp) * 1000),
                                                rawMessage: message // Store full payload
                                            }
                                        });

                                        // Trigger download if media (and we have ID)
                                        if (['image', 'video', 'audio', 'document', 'sticker'].includes(message.type) && mediaUrl) {
                                            const mimetype = message[message.type]?.mime_type;
                                            // Run in background
                                            handleMediaDownload(instance.id, message.id, message.type, mimetype).catch(err => logger.error({ err }, 'Background download failed'));
                                        }
                                    }

                                    const eventData = {
                                        instanceId: instance.id,
                                        ...message,
                                        _metadata: metadata
                                    };

                                    // Also dispatch to user's configured webhook
                                    dispatchWebhook(instance.id, 'message', eventData);
                                }
                            }
                        }
                    }

                    if (value.statuses) {
                        // Handle message status updates (sent, delivered, read)
                        for (const status of value.statuses) {
                            if (metadata && metadata.phone_number_id) {
                                const instance = await prisma.instance.findFirst({
                                    where: { waPhoneNumberId: metadata.phone_number_id }
                                });
                                if (instance) {
                                    // Update message status in DB
                                    if (status.id) {
                                        await prisma.message.updateMany({
                                            where: { waMessageId: status.id },
                                            data: {
                                                status: status.status.toUpperCase(),
                                                ...(status.status === 'delivered' ? { deliveredAt: new Date() } : {}),
                                                ...(status.status === 'read' ? { readAt: new Date() } : {})
                                            }
                                        });
                                    }

                                    dispatchWebhook(instance.id, 'message_ack', {
                                        instanceId: instance.id,
                                        ...status
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        return c.json({ status: 'ok' });
    } catch (error) {
        logger.error({ error }, 'Error processing webhook');
        return c.json({ error: 'Internal Server Error' }, 500);
    }
});

export { webhooks as webhooksRoutes };
