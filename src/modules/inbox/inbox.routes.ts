import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { authMiddleware } from '../../middlewares/auth.js';
import { HTTPException } from 'hono/http-exception';

const inbox = new Hono();

inbox.use('*', authMiddleware);

inbox.get('/threads', async (c) => {
    const user = c.get('user');

    const schema = z.object({
        limit: z.coerce.number().min(1).max(200).default(50),
        q: z.string().optional(),
    });
    const { limit, q } = schema.parse({
        limit: c.req.query('limit'),
        q: c.req.query('q') || undefined,
    });

    const where: any = {
        instance: { userId: user.userId },
        contactId: { not: null },
    };

    if (q) {
        where.OR = [
            { body: { contains: q, mode: 'insensitive' } },
            { contact: { pushName: { contains: q, mode: 'insensitive' } } },
            { contact: { waId: { contains: q, mode: 'insensitive' } } },
        ];
    }

    const lastMessages = await prisma.message.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit * 10,
        select: {
            id: true,
            body: true,
            mediaType: true,
            createdAt: true,
            direction: true,
            instanceId: true,
            contactId: true,
            contact: {
                select: {
                    id: true,
                    waId: true,
                    pushName: true,
                    profilePictureUrl: true,
                    instanceId: true,
                },
            },
        },
    });

    const seen = new Set<string>();
    const threads: any[] = [];
    for (const msg of lastMessages) {
        if (!msg.contactId || !msg.contact) continue;
        const key = `${msg.instanceId}:${msg.contactId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        threads.push({
            instanceId: msg.instanceId,
            contact: msg.contact,
            lastMessage: {
                id: msg.id,
                body: msg.body,
                mediaType: msg.mediaType,
                createdAt: msg.createdAt,
                direction: msg.direction,
            },
        });
        if (threads.length >= limit) break;
    }

    return c.json({
        success: true,
        data: threads,
    });
});

inbox.get('/messages', async (c) => {
    const user = c.get('user');

    const schema = z.object({
        instanceId: z.string().uuid(),
        contactId: z.string().uuid(),
        limit: z.coerce.number().min(1).max(500).default(50),
    });
    const { instanceId, contactId, limit } = schema.parse({
        instanceId: c.req.query('instanceId'),
        contactId: c.req.query('contactId'),
        limit: c.req.query('limit'),
    });

    const instance = await prisma.instance.findFirst({
        where: {
            id: instanceId,
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
        select: { id: true },
    });

    if (!instance) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    const contact = await prisma.contact.findFirst({
        where: { id: contactId, instanceId },
        select: { id: true },
    });

    if (!contact) {
        throw new HTTPException(404, { message: 'Contact not found' });
    }

    const messages = await prisma.message.findMany({
        where: { instanceId, contactId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
            id: true,
            direction: true,
            from: true,
            to: true,
            body: true,
            mediaUrl: true,
            mediaType: true,
            status: true,
            createdAt: true,
        },
    });

    return c.json({
        success: true,
        data: messages.reverse(),
    });
});

export { inbox as inboxRoutes };

