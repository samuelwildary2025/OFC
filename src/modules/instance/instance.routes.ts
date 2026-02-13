import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { waManager } from '../../lib/whatsapp.js';
import { facebookService } from '../../lib/facebook.js';
import { authMiddleware } from '../../middlewares/auth.js';
import { HTTPException } from 'hono/http-exception';
import { env } from '../../config/env.js';

const instance = new Hono();

instance.get('/', authMiddleware, async (c) => {
    const user = c.get('user');

    const instances = await prisma.instance.findMany({
        where: {
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
        orderBy: { createdAt: 'desc' },
    });

    const instancesWithLiveStatus = instances.map((item) => {
        const liveStatus = waManager.getStatus(item.id);
        const qrData = waManager.getQRCode(item.id);

        return {
            id: item.id,
            name: item.name,
            token: item.token,
            status: liveStatus !== 'not_found' ? liveStatus : item.status.toLowerCase(),
            waNumber: item.waNumber,
            waName: item.waName,
            webhookUrl: item.webhookUrl,
            webhookEvents: item.webhookEvents,
            qrCode: qrData.qrBase64,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
        };
    });

    return c.json({
        success: true,
        data: instancesWithLiveStatus,
    });
});

instance.post('/', authMiddleware, async (c) => {
    const user = c.get('user');

    const body = await c.req.json();
    const schema = z.object({
        name: z.string().min(1).max(100),
    });
    const data = schema.parse(body);

    const instanceCount = await prisma.instance.count({
        where: { userId: user.userId },
    });

    if (instanceCount >= env.waMaxInstances) {
        throw new HTTPException(400, {
            message: `Maximum number of instances (${env.waMaxInstances}) reached`,
        });
    }

    const created = await prisma.instance.create({
        data: {
            name: data.name,
            userId: user.userId,
        },
    });

    return c.json({
        success: true,
        data: {
            id: created.id,
            name: created.name,
            token: created.token,
            status: created.status.toLowerCase(),
            createdAt: created.createdAt,
        },
    });
});

instance.get('/:id', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    const item = await prisma.instance.findFirst({
        where: {
            id,
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
    });

    if (!item) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    const liveStatus = waManager.getStatus(id);
    const qrData = waManager.getQRCode(id);

    return c.json({
        success: true,
        data: {
            id: item.id,
            name: item.name,
            token: item.token,
            status: liveStatus !== 'not_found' ? liveStatus : item.status.toLowerCase(),
            waNumber: item.waNumber,
            waName: item.waName,
            waPicture: item.waPicture,
            webhookUrl: item.webhookUrl,
            webhookEvents: item.webhookEvents,
            qrCode: qrData.qrBase64,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
        },
    });
});

instance.delete('/:id', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    const instanceData = await prisma.instance.findFirst({
        where: {
            id,
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
        select: { id: true },
    });

    if (!instanceData) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    await waManager.deleteInstance(id).catch(() => undefined);
    await prisma.instance.delete({ where: { id } });

    return c.json({
        success: true,
        message: 'Instance deleted successfully',
    });
});

instance.get('/stats', authMiddleware, async (c) => {
    const user = c.get('user');

    const [instances, connectedInstances, campaigns, messages] = await Promise.all([
        prisma.instance.count({ where: { userId: user.userId } }),
        prisma.instance.count({ where: { userId: user.userId, status: 'CONNECTED' } }),
        prisma.campaign.count({ where: { instance: { userId: user.userId } } }),
        prisma.message.count({ where: { instance: { userId: user.userId } } }),
    ]);

    return c.json({
        success: true,
        data: {
            instances: {
                total: instances,
                connected: connectedInstances,
            },
            campaigns,
            messages,
        },
    });
});

// ================================
// Schemas
// ================================

const updateNameSchema = z.object({
    name: z.string().min(1).max(100),
});

const updateSettingsSchema = z.object({
    alwaysOnline: z.boolean().optional(),
    ignoreGroups: z.boolean().optional(),
    rejectCalls: z.boolean().optional(),
    readMessages: z.boolean().optional(),
    syncFullHistory: z.boolean().optional(),
});

const updateProxySchema = z.object({
    proxyHost: z.string().nullable().optional(),
    proxyPort: z.string().nullable().optional(),
    proxyUsername: z.string().nullable().optional(),
    proxyPassword: z.string().nullable().optional(),
    proxyProtocol: z.enum(['http', 'https', 'socks4', 'socks5']).nullable().optional(),
});

// ================================
// Proxy Check Route (Placed top for priority)
// ================================

/**
 * GET /instance/:id/check-proxy
 * Check proxy connection and return egress IP
 */
instance.get('/:id/check-proxy', async (c) => {
    const { id } = c.req.param();
    // Auth disabled for testing as requested
    // const user = c.get('user');

    const instanceData = await prisma.instance.findFirst({
        where: {
            id,
            // OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
    });

    if (!instanceData) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    // Checking proxy via whatsmeow manager
    const result = await waManager.checkProxy(id);

    if (result.error) {
        throw new HTTPException(502, { message: result.error });
    }

    return c.json({
        success: true,
        data: {
            ip: result.ip,
            message: 'Proxy check successful'
        }
    });
});

// ================================
// Instance Connection Routes
// ================================

/**
 * POST /instance/:id/connect
 * Connect instance to WhatsApp (generates QR code)
 */
instance.post('/:id/connect', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    // Check instance exists and belongs to user - also fetch proxy config
    const instanceData = await prisma.instance.findFirst({
        where: {
            id,
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
        select: {
            id: true,
            proxyHost: true,
            proxyPort: true,
            proxyUsername: true,
            proxyPassword: true,
            proxyProtocol: true,
        },
    });

    if (!instanceData) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    try {
        // Build proxy config if set in database
        const proxy = instanceData.proxyHost && instanceData.proxyPort ? {
            proxyHost: instanceData.proxyHost,
            proxyPort: instanceData.proxyPort,
            proxyUsername: instanceData.proxyUsername || undefined,
            proxyPassword: instanceData.proxyPassword || undefined,
            proxyProtocol: instanceData.proxyProtocol || 'http',
        } : undefined;

        const waInstance = await waManager.connect(id, proxy);

        return c.json({
            success: true,
            data: {
                status: waInstance.status,
                qrCode: waInstance.qrCodeBase64,
                usingProxy: !!proxy,
                message: waInstance.status === 'connected'
                    ? 'Already connected'
                    : 'Scan the QR code with WhatsApp',
            },
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to connect'
        });
    }
});

/**
 * POST /instance/:id/connect-code
 * Connect instance using pairing code (alternative to QR)
 */
instance.post('/:id/connect-code', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    // Check instance exists and belongs to user
    const instanceData = await prisma.instance.findFirst({
        where: {
            id,
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
    });

    if (!instanceData) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    try {
        const body = await c.req.json();
        const phoneNumber = body.phoneNumber;

        if (!phoneNumber) {
            throw new HTTPException(400, { message: 'phoneNumber is required' });
        }

        const result = await waManager.connectWithPairingCode(id, phoneNumber);

        return c.json({
            success: true,
            data: {
                status: 'pairing',
                pairingCode: result.pairingCode,
                message: 'Enter this code in WhatsApp > Settings > Linked Devices > Link a Device',
            },
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to get pairing code'
        });
    }
});

/**
 * POST /instance/:id/disconnect
 * Disconnect instance (keeps session for reconnection)
 */
instance.post('/:id/disconnect', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    const instanceData = await prisma.instance.findFirst({
        where: {
            id,
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
    });

    if (!instanceData) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    try {
        await waManager.disconnect(id);

        return c.json({
            success: true,
            message: 'Instance disconnected successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to disconnect'
        });
    }
});

/**
 * POST /instance/:id/logout
 * Logout from WhatsApp (removes session)
 */
instance.post('/:id/logout', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    const instanceData = await prisma.instance.findFirst({
        where: {
            id,
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
    });

    if (!instanceData) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    try {
        await waManager.logout(id);

        return c.json({
            success: true,
            message: 'Logged out successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to logout'
        });
    }
});

/**
 * GET /debug/instances
 * List all instance IDs for debugging
 */
instance.get('/debug-list', async (c) => {
    const instances = await prisma.instance.findMany({
        select: { id: true, name: true, status: true }
    });
    return c.json({ success: true, count: instances.length, instances });
});

/**
 * GET /instance/:id/status
 * Get instance status
 */
instance.get('/:id/status', async (c) => {
    const { id } = c.req.param();
    // const user = c.get('user');

    const instanceData = await prisma.instance.findFirst({
        where: {
            id,
            // OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
    });

    if (!instanceData) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    const status = waManager.getStatus(id);

    return c.json({
        success: true,
        data: {
            status,
            name: instanceData.name,
            waName: instanceData.waName,
            waNumber: instanceData.waNumber,
            profilePictureUrl: instanceData.waPicture,
        }
    });
});

/**
 * GET /instance/:id/qr
 * Get QR code for connection
 */
instance.get('/:id/qr', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    const instanceData = await prisma.instance.findFirst({
        where: {
            id,
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
    });

    if (!instanceData) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    const qrData = waManager.getQRCode(id);

    if (!qrData.qrBase64) {
        const status = waManager.getStatus(id);
        if (status === 'connected') {
            return c.json({
                success: true,
                data: {
                    status: 'connected',
                    message: 'Already connected, no QR code needed',
                },
            });
        }

        return c.json({
            success: false,
            error: 'QR code not available. Try connecting first.',
        }, 400);
    }

    return c.json({
        success: true,
        data: {
            qrCode: qrData.qrBase64,
        },
    });
});

/**
 * GET /instance/:id/qr/stream
 * Stream QR code updates via SSE
 */
instance.get('/:id/qr/stream', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    const instanceData = await prisma.instance.findFirst({
        where: {
            id,
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
    });

    if (!instanceData) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    return streamSSE(c, async (stream) => {
        let isConnected = false;

        const onQR = (data: { instanceId: string; qrBase64: string }) => {
            if (data.instanceId === id) {
                stream.writeSSE({
                    data: JSON.stringify({ type: 'qr', qrCode: data.qrBase64 }),
                    event: 'qr',
                });
            }
        };

        const onReady = (data: { instanceId: string }) => {
            if (data.instanceId === id) {
                isConnected = true;
                stream.writeSSE({
                    data: JSON.stringify({ type: 'connected' }),
                    event: 'connected',
                });
            }
        };

        const onDisconnected = (data: { instanceId: string }) => {
            if (data.instanceId === id) {
                stream.writeSSE({
                    data: JSON.stringify({ type: 'disconnected' }),
                    event: 'disconnected',
                });
            }
        };

        waManager.on('qr', onQR);
        waManager.on('ready', onReady);
        waManager.on('disconnected', onDisconnected);

        // Send initial status
        const currentStatus = waManager.getStatus(id);
        const qrData = waManager.getQRCode(id);

        stream.writeSSE({
            data: JSON.stringify({
                type: 'status',
                status: currentStatus,
                qrCode: qrData.qrBase64,
            }),
            event: 'status',
        });

        // Keep connection alive
        while (!isConnected) {
            await stream.sleep(30000); // Keep-alive every 30s
            stream.writeSSE({
                data: JSON.stringify({ type: 'ping' }),
                event: 'ping',
            });
        }

        // Cleanup
        waManager.off('qr', onQR);
        waManager.off('ready', onReady);
        waManager.off('disconnected', onDisconnected);
    });
});

/**
 * POST /instance/:id/name
 * Update instance name
 */
instance.post('/:id/name', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');
    const body = await c.req.json();
    const data = updateNameSchema.parse(body);

    const instanceData = await prisma.instance.findFirst({
        where: {
            id,
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
    });

    if (!instanceData) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    const updated = await prisma.instance.update({
        where: { id },
        data: { name: data.name },
    });

    return c.json({
        success: true,
        data: {
            id: updated.id,
            name: updated.name,
        },
    });
});

// ================================
// Instance Webhook Routes
// ================================

/**
 * GET /instance/:id/webhook
 * Get instance webhook configuration
 */
instance.get('/:id/webhook', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    const instanceData = await prisma.instance.findFirst({
        where: {
            id,
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
        select: {
            id: true,
            webhookUrl: true,
            webhookEvents: true,
        },
    });

    if (!instanceData) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    return c.json({
        success: true,
        data: instanceData,
    });
});

/**
 * POST /instance/:id/webhook
 * Configure instance webhook
 */
instance.post('/:id/webhook', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
        webhookUrl: z.string().url().nullable(),
        webhookEvents: z.array(z.string()).optional(),
    });
    const data = schema.parse(body);

    const instanceData = await prisma.instance.findFirst({
        where: {
            id,
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
    });

    if (!instanceData) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    const updated = await prisma.instance.update({
        where: { id },
        data: {
            webhookUrl: data.webhookUrl,
            webhookEvents: data.webhookEvents || [],
        },
    });

    return c.json({
        success: true,
        data: {
            id: updated.id,
            webhookUrl: updated.webhookUrl,
            webhookEvents: updated.webhookEvents,
        },
    });
});

// ================================
// Instance Settings Routes
// ================================

/**
 * GET /instance/:id/settings
 * Get instance behavior settings
 */
instance.get('/:id/settings', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    const instanceData = await prisma.instance.findFirst({
        where: {
            id,
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
        select: {
            id: true,
            alwaysOnline: true,
            ignoreGroups: true,
            rejectCalls: true,
            readMessages: true,
            syncFullHistory: true,
        },
    });

    if (!instanceData) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    return c.json({
        success: true,
        data: instanceData,
    });
});

/**
 * PATCH /instance/:id/settings
 * Update instance behavior settings
 */
instance.patch('/:id/settings', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    try {
        const body = await c.req.json();
        const data = updateSettingsSchema.parse(body);

        const instanceData = await prisma.instance.findFirst({
            where: {
                id,
                OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
            },
        });

        if (!instanceData) {
            throw new HTTPException(404, { message: 'Instance not found' });
        }

        const updated = await prisma.instance.update({
            where: { id },
            data: {
                ...(data.alwaysOnline !== undefined && { alwaysOnline: data.alwaysOnline }),
                ...(data.ignoreGroups !== undefined && { ignoreGroups: data.ignoreGroups }),
                ...(data.rejectCalls !== undefined && { rejectCalls: data.rejectCalls }),
                ...(data.readMessages !== undefined && { readMessages: data.readMessages }),
                ...(data.syncFullHistory !== undefined && { syncFullHistory: data.syncFullHistory }),
            },
            select: {
                id: true,
                alwaysOnline: true,
                ignoreGroups: true,
                rejectCalls: true,
                readMessages: true,
                syncFullHistory: true,
            },
        });

        // Notify WhatsApp manager about settings change
        waManager.updateInstanceSettings(id, updated);

        return c.json({
            success: true,
            data: updated,
        });
    } catch (error: any) {
        console.error('Error updating settings:', error);
        return c.json({
            success: false,
            error: error.message || 'Failed to update settings',
        }, 500);
    }
});

// ================================
// Instance Proxy Routes
// ================================

/**
 * GET /instance/:id/proxy
 * Get instance proxy configuration
 */
instance.get('/:id/proxy', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    const instanceData = await prisma.instance.findFirst({
        where: {
            id,
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
        select: {
            id: true,
            proxyHost: true,
            proxyPort: true,
            proxyUsername: true,
            proxyPassword: true,
            proxyProtocol: true,
        },
    });

    if (!instanceData) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    return c.json({
        success: true,
        data: {
            id: instanceData.id,
            proxyHost: instanceData.proxyHost,
            proxyPort: instanceData.proxyPort,
            proxyUsername: instanceData.proxyUsername,
            // Don't expose password, just indicate if it's set
            proxyPasswordSet: !!instanceData.proxyPassword,
            proxyProtocol: instanceData.proxyProtocol,
        },
    });
});

/**
 * GET /instance/:id/proxy/check
 * Check proxy connection and return egress IP
 */


/**
 * PATCH /instance/:id/proxy
 * Update instance proxy configuration
 */
instance.patch('/:id/proxy', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    try {
        const body = await c.req.json();
        const data = updateProxySchema.parse(body);

        const instanceData = await prisma.instance.findFirst({
            where: {
                id,
                OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
            },
        });

        if (!instanceData) {
            throw new HTTPException(404, { message: 'Instance not found' });
        }

        const updated = await prisma.instance.update({
            where: { id },
            data: {
                proxyHost: data.proxyHost,
                proxyPort: data.proxyPort,
                proxyUsername: data.proxyUsername,
                proxyPassword: data.proxyPassword,
                proxyProtocol: data.proxyProtocol,
            },
            select: {
                id: true,
                proxyHost: true,
                proxyPort: true,
                proxyUsername: true,
                proxyProtocol: true,
            },
        });

        // Forward proxy config to whatsmeow
        await waManager.setProxy(id, {
            proxyHost: data.proxyHost || '',
            proxyPort: data.proxyPort || '',
            proxyUsername: data.proxyUsername || '',
            proxyPassword: data.proxyPassword || '',
            proxyProtocol: data.proxyProtocol || 'http',
        });

        return c.json({
            success: true,
            data: updated,
        });

    } catch (error: any) {
        console.error('Error updating proxy:', error);
        return c.json({
            success: false,
            error: error.message || 'Failed to update proxy',
        }, 500);
    }
});

/**
 * POST /instance/:id/credentials
 * Update Official WhatsApp API credentials
 */
instance.post('/:id/credentials', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    try {
        const body = await c.req.json();
        const schema = z.object({
            waPhoneNumberId: z.string().min(1),
            waAccessToken: z.string().min(1),
            waBusinessAccountId: z.string().optional(),
        });
        const data = schema.parse(body);

        const instanceData = await prisma.instance.findFirst({
            where: {
                id,
                OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
            },
        });

        if (!instanceData) {
            throw new HTTPException(404, { message: 'Instance not found' });
        }

        const updated = await prisma.instance.update({
            where: { id },
            data: {
                waPhoneNumberId: data.waPhoneNumberId,
                waAccessToken: data.waAccessToken,
                waBusinessAccountId: data.waBusinessAccountId,
            },
        });

        // Trigger a "reconnect" to verify credentials and update phone info
        // This runs in background to not block the UI
        waManager.connect(id).catch(err => {
            console.error(`Failed to verify credentials for instance ${id}:`, err);
        });

        return c.json({
            success: true,
            data: {
                id: updated.id,
                message: 'Credentials updated. Verifying connection...',
            },
        });
    } catch (error: any) {
        console.error('Error updating credentials:', error);
        return c.json({
            success: false,
            error: error.message || 'Failed to update credentials',
        }, 500);
    }
});

/**
 * POST /instance/:id/embedded-signup
 * Handle Embedded Signup (Facebook Login) callback
 */
instance.post('/:id/embedded-signup', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    try {
        const body = await c.req.json();
        const schema = z.object({
            code: z.string().min(1).optional(),
            accessToken: z.string().min(1).optional(),
            wabaId: z.string().min(1),
            phoneNumberId: z.string().min(1),
        }).refine((data) => Boolean(data.code || data.accessToken), {
            message: 'Missing code or access token',
        });
        const data = schema.parse(body);

        const instanceData = await prisma.instance.findFirst({
            where: {
                id,
                OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
            },
        });

        if (!instanceData) {
            throw new HTTPException(404, { message: 'Instance not found' });
        }

        // 1. Exchange code for access token (COEX Flow)
        const accessToken = data.code
            ? await facebookService.exchangeCodeForToken(data.code)
            : await facebookService.exchangeForLongLivedToken(data.accessToken as string);

        // 2. Subscribe App to WABA Webhooks (System User Token required usually, or granular scopes)
        // With Embedded Signup, the user token typically has permission for the specific WABA
        await facebookService.subscribeAppToWABA(data.wabaId, accessToken);

        // 3. Update Instance
        const updated = await prisma.instance.update({
            where: { id },
            data: {
                waPhoneNumberId: data.phoneNumberId,
                waAccessToken: accessToken,
                waBusinessAccountId: data.wabaId,
                status: 'CONNECTED' // Optimistic connection status
            },
        });

        // 4. Verify connection
        waManager.connect(id).catch(err => {
            console.error(`Failed to verify credentials for instance ${id}:`, err);
        });

        return c.json({
            success: true,
            data: {
                id: updated.id,
                message: 'Embedded Signup successful. Instance connected.',
            },
        });

    } catch (error: any) {
        console.error('Error in Embedded Signup:', error);
        return c.json({
            success: false,
            error: error.message || 'Failed to complete Embedded Signup',
        }, 500);
    }
});

export { instance as instanceRoutes };
