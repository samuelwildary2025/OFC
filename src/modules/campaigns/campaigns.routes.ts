import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { waManager } from '../../lib/whatsapp.js';
import { redis } from '../../lib/redis.js';
import { authMiddleware } from '../../middlewares/auth.js';
import { HTTPException } from 'hono/http-exception';
import { Queue } from 'bullmq';
import { logger } from '../../lib/logger.js';

const campaigns = new Hono();

const runningProcessors = new Set<string>();

async function processCampaign(campaignId: string) {
    if (runningProcessors.has(campaignId)) return;
    runningProcessors.add(campaignId);

    try {
        while (true) {
            const campaign = await prisma.campaign.findUnique({
                where: { id: campaignId },
                include: { instance: true },
            });

            if (!campaign) return;
            if (campaign.status !== 'RUNNING') return;

            const instanceStatus = waManager.getStatus(campaign.instanceId);
            if (instanceStatus !== 'connected') {
                await prisma.campaign.update({
                    where: { id: campaignId },
                    data: { status: 'PAUSED' },
                    select: { id: true },
                });
                return;
            }

            const message = await prisma.message.findFirst({
                where: { campaignId, status: 'PENDING' },
                orderBy: { createdAt: 'asc' },
            });

            if (!message) {
                await prisma.campaign.update({
                    where: { id: campaignId },
                    data: { status: 'COMPLETED', completedAt: new Date() },
                    select: { id: true },
                });
                return;
            }

            try {
                if (message.mediaUrl) {
                    await waManager.sendMedia(campaign.instanceId, message.to, message.mediaUrl, {
                        caption: message.body || undefined,
                    });
                } else {
                    await waManager.sendText(campaign.instanceId, message.to, message.body || '');
                }

                await prisma.message.update({
                    where: { id: message.id },
                    data: { status: 'SENT', sentAt: new Date() },
                });

                await prisma.campaign.update({
                    where: { id: campaignId },
                    data: { sentMessages: { increment: 1 } },
                    select: { id: true },
                });
            } catch (error) {
                await prisma.message.update({
                    where: { id: message.id },
                    data: {
                        status: 'FAILED',
                        errorMsg: error instanceof Error ? error.message : 'Unknown error',
                    },
                });

                await prisma.campaign.update({
                    where: { id: campaignId },
                    data: { failedMessages: { increment: 1 } },
                    select: { id: true },
                });
            }

            await new Promise((resolve) => setTimeout(resolve, campaign.delay));
        }
    } finally {
        runningProcessors.delete(campaignId);
    }
}

// ================================
// BullMQ Queue Setup
// ================================

const campaignQueue = {
    add: async (name: string, data: any, opts?: any) => {
        logger.warn('Redis disabled: Campaign queue not active');
        return null;
    }
} as any;
// const campaignQueue = new Queue('campaigns', {
//     connection: redis,
//     defaultJobOptions: {
//         removeOnComplete: 100,
//         removeOnFail: 50,
//     },
// });

// ================================
// Schemas
// ================================

const createSimpleCampaignSchema = z.object({
    name: z.string().min(1).max(100),
    instanceId: z.string().uuid(),
    message: z.object({
        type: z.enum(['text', 'media']),
        text: z.string().optional(),
        mediaUrl: z.string().url().optional(),
        caption: z.string().optional(),
    }),
    recipients: z.array(z.string().min(1)).min(1),
    delay: z.number().min(1000).max(60000).default(5000), // 1s to 60s between messages
});

const createAdvancedCampaignSchema = z.object({
    name: z.string().min(1).max(100),
    instanceId: z.string().uuid(),
    messages: z.array(z.object({
        to: z.string().min(1),
        content: z.object({
            type: z.enum(['text', 'media']),
            text: z.string().optional(),
            mediaUrl: z.string().url().optional(),
            caption: z.string().optional(),
        }),
    })).min(1),
    delay: z.number().min(1000).max(60000).default(5000),
});

const controlCampaignSchema = z.object({
    action: z.enum(['pause', 'resume', 'cancel']),
});

// ================================
// Routes - User Auth
// ================================

/**
 * GET /campaigns
 * List all campaigns for user
 */
campaigns.get('/', authMiddleware, async (c) => {
    const user = c.get('user');

    const campaignsList = await prisma.campaign.findMany({
        where: {
            instance: {
                userId: user.userId,
            },
        },
        include: {
            instance: {
                select: {
                    id: true,
                    name: true,
                },
            },
            _count: {
                select: { messages: true },
            },
        },
        orderBy: { createdAt: 'desc' },
    });

    return c.json({
        success: true,
        data: campaignsList.map(campaign => ({
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            instance: campaign.instance,
            totalMessages: campaign.totalMessages,
            sentMessages: campaign.sentMessages,
            failedMessages: campaign.failedMessages,
            progress: campaign.totalMessages > 0
                ? Math.round((campaign.sentMessages / campaign.totalMessages) * 100)
                : 0,
            startedAt: campaign.startedAt,
            completedAt: campaign.completedAt,
            createdAt: campaign.createdAt,
        })),
    });
});

/**
 * POST /campaign/simple
 * Create a simple campaign (same message to multiple recipients)
 */
campaigns.post('/simple', authMiddleware, async (c) => {
    const user = c.get('user');
    const body = await c.req.json();
    const data = createSimpleCampaignSchema.parse(body);

    // Verify instance belongs to user
    const instance = await prisma.instance.findFirst({
        where: {
            id: data.instanceId,
            userId: user.userId,
        },
    });

    if (!instance) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    // Create campaign
    const campaign = await prisma.campaign.create({
        data: {
            name: data.name,
            instanceId: data.instanceId,
            delay: data.delay,
            totalMessages: data.recipients.length,
            messages: {
                create: data.recipients.map(to => ({
                    to,
                    instanceId: data.instanceId,
                    from: instance.waNumber || 'unknown',
                    direction: 'OUTBOUND',
                    body: data.message.text || data.message.caption || '',
                    mediaUrl: data.message.mediaUrl,
                    mediaType: data.message.type === 'media' ? 'image' : 'text',
                    status: 'PENDING',
                })),
            },
        },
    });

    return c.json({
        success: true,
        data: {
            id: campaign.id,
            name: campaign.name,
            totalMessages: campaign.totalMessages,
            status: campaign.status,
        },
    });
});

/**
 * POST /campaign/advanced
 * Create an advanced campaign (different messages per recipient)
 */
campaigns.post('/advanced', authMiddleware, async (c) => {
    const user = c.get('user');
    const body = await c.req.json();
    const data = createAdvancedCampaignSchema.parse(body);

    // Verify instance belongs to user
    const instance = await prisma.instance.findFirst({
        where: {
            id: data.instanceId,
            userId: user.userId,
        },
    });

    if (!instance) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    // Create campaign
    const campaign = await prisma.campaign.create({
        data: {
            name: data.name,
            instanceId: data.instanceId,
            delay: data.delay,
            totalMessages: data.messages.length,
            messages: {
                create: data.messages.map(msg => ({
                    to: msg.to,
                    instanceId: data.instanceId,
                    from: instance.waNumber || 'unknown',
                    direction: 'OUTBOUND',
                    body: msg.content.text || msg.content.caption || '',
                    mediaUrl: msg.content.mediaUrl,
                    mediaType: msg.content.type === 'media' ? 'image' : 'text',
                    status: 'PENDING',
                })),
            },
        },
    });

    return c.json({
        success: true,
        data: {
            id: campaign.id,
            name: campaign.name,
            totalMessages: campaign.totalMessages,
            status: campaign.status,
        },
    });
});

/**
 * POST /campaign/:id/control
 * Control campaign (start, pause, resume, cancel)
 */
campaigns.post('/:id/control', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');
    const body = await c.req.json();
    const { action } = controlCampaignSchema.parse(body);

    const campaign = await prisma.campaign.findFirst({
        where: {
            id,
            instance: {
                userId: user.userId,
            },
        },
        include: {
            instance: true,
        },
    });

    if (!campaign) {
        throw new HTTPException(404, { message: 'Campaign not found' });
    }

    switch (action) {
        case 'pause':
            if (campaign.status !== 'RUNNING') {
                throw new HTTPException(400, { message: 'Campaign is not running' });
            }
            await prisma.campaign.update({
                where: { id },
                data: { status: 'PAUSED' },
            });
            break;

        case 'resume':
            if (campaign.status !== 'PAUSED') {
                throw new HTTPException(400, { message: 'Campaign is not paused' });
            }
            await prisma.campaign.update({
                where: { id },
                data: { status: 'RUNNING' },
            });
            void processCampaign(id);
            break;

        case 'cancel':
            if (campaign.status === 'COMPLETED' || campaign.status === 'CANCELLED') {
                throw new HTTPException(400, { message: 'Campaign already finished' });
            }
            await prisma.campaign.update({
                where: { id },
                data: { status: 'CANCELLED' },
            });
            break;
    }

    return c.json({
        success: true,
        message: `Campaign ${action}ed successfully`,
    });
});

/**
 * POST /campaign/:id/start
 * Start a campaign
 */
campaigns.post('/:id/start', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    const campaign = await prisma.campaign.findFirst({
        where: {
            id,
            instance: {
                userId: user.userId,
            },
        },
        include: {
            instance: true,
        },
    });

    if (!campaign) {
        throw new HTTPException(404, { message: 'Campaign not found' });
    }

    if (campaign.status !== 'PENDING') {
        throw new HTTPException(400, { message: 'Campaign already started or finished' });
    }

    // Check if instance is connected
    const status = waManager.getStatus(campaign.instanceId);
    if (status !== 'connected') {
        throw new HTTPException(400, { message: 'Instance is not connected' });
    }

    // Update campaign status and add to queue
    await prisma.campaign.update({
        where: { id },
        data: {
            status: 'RUNNING',
            startedAt: new Date(),
        },
    });

    void processCampaign(id);

    return c.json({
        success: true,
        message: 'Campaign started successfully',
    });
});

/**
 * GET /campaign/:id
 * Get campaign details
 */
campaigns.get('/:id', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    const campaign = await prisma.campaign.findFirst({
        where: {
            id,
            instance: {
                userId: user.userId,
            },
        },
        include: {
            instance: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
    });

    if (!campaign) {
        throw new HTTPException(404, { message: 'Campaign not found' });
    }

    return c.json({
        success: true,
        data: {
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            instance: campaign.instance,
            totalMessages: campaign.totalMessages,
            sentMessages: campaign.sentMessages,
            failedMessages: campaign.failedMessages,
            progress: campaign.totalMessages > 0
                ? Math.round((campaign.sentMessages / campaign.totalMessages) * 100)
                : 0,
            delay: campaign.delay,
            startedAt: campaign.startedAt,
            completedAt: campaign.completedAt,
            createdAt: campaign.createdAt,
        },
    });
});

/**
 * POST /campaign/:id/messages
 * Get messages from a campaign
 */
campaigns.post('/:id/messages', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
        status: z.enum(['all', 'PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED']).default('all'),
    });
    const { page, limit, status } = schema.parse(body);

    const campaign = await prisma.campaign.findFirst({
        where: {
            id,
            instance: {
                userId: user.userId,
            },
        },
    });

    if (!campaign) {
        throw new HTTPException(404, { message: 'Campaign not found' });
    }

    const where: any = { campaignId: id };
    if (status !== 'all') {
        where.status = status;
    }

    const [messages, total] = await Promise.all([
        prisma.message.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'asc' },
        }),
        prisma.message.count({ where }),
    ]);

    return c.json({
        success: true,
        data: {
            messages,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        },
    });
});

/**
 * DELETE /campaign/:id
 * Delete a campaign
 */
campaigns.delete('/:id', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    const campaign = await prisma.campaign.findFirst({
        where: {
            id,
            instance: {
                userId: user.userId,
            },
        },
    });

    if (!campaign) {
        throw new HTTPException(404, { message: 'Campaign not found' });
    }

    if (campaign.status === 'RUNNING') {
        throw new HTTPException(400, { message: 'Cannot delete a running campaign' });
    }

    await prisma.campaign.delete({
        where: { id },
    });

    return c.json({
        success: true,
        message: 'Campaign deleted successfully',
    });
});

// ================================
// Campaign Worker
// ================================

export function startCampaignWorker() {
    logger.info('Campaign worker not required');
    return null;
}

export { campaigns as campaignsRoutes };
