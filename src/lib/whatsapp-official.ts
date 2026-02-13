
import { EventEmitter } from 'events';
import { IWhatsAppManager, InstanceSettings, WAInstance } from './whatsapp.js';
import { prisma } from './prisma.js';
import { logger } from './logger.js';

interface OfficialInstanceSession {
    phoneNumberId: string;
    accessToken: string;
    businessAccountId: string;
}

export class OfficialWhatsAppManager extends EventEmitter implements IWhatsAppManager {
    private sessions: Map<string, OfficialInstanceSession> = new Map();

    constructor() {
        super();
    }

    // ================================
    // Helper Methods
    // ================================

    private async getSession(instanceId: string): Promise<OfficialInstanceSession> {
        if (this.sessions.has(instanceId)) {
            return this.sessions.get(instanceId)!;
        }

        const instance = await prisma.instance.findUnique({
            where: { id: instanceId },
            select: { waPhoneNumberId: true, waAccessToken: true, waBusinessAccountId: true }
        });

        if (!instance || !instance.waPhoneNumberId || !instance.waAccessToken) {
            throw new Error(`Instance ${instanceId} is not configured efficiently. Missing Phone Number ID or Access Token.`);
        }

        const session = {
            phoneNumberId: instance.waPhoneNumberId,
            accessToken: instance.waAccessToken,
            businessAccountId: instance.waBusinessAccountId || ''
        };

        this.sessions.set(instanceId, session);
        return session;
    }

    private async apiRequest(instanceId: string, method: string, endpoint: string, body?: any): Promise<any> {
        const session = await this.getSession(instanceId);
        const url = `https://graph.facebook.com/v19.0/${endpoint}`;

        const headers: Record<string, string> = {
            'Authorization': `Bearer ${session.accessToken}`,
            'Content-Type': 'application/json'
        };

        const response = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });

        const data = await response.json() as any;

        if (!response.ok) {
            throw new Error(data.error?.message || `API Request Failed: ${response.statusText}`);
        }

        return data;
    }

    // ================================
    // Instance Management
    // ================================

    async createInstance(instanceId: string): Promise<any> {
        // No creation needed for API, just ensure DB record exists (handled by route)
        return { id: instanceId, status: 'created' };
    }

    async connect(instanceId: string, proxy?: any): Promise<any> {
        // "Connect" verifies credentials
        try {
            const session = await this.getSession(instanceId);
            // Verify token by checking phone number details
            const data = await this.apiRequest(instanceId, 'GET', session.phoneNumberId);

            // Update status in DB
            await prisma.instance.update({
                where: { id: instanceId },
                data: {
                    status: 'CONNECTED',
                    waNumber: data.display_phone_number,
                    waName: data.verified_name
                }
            });

            this.emit('ready', { instanceId });
            return { status: 'connected', waNumber: data.display_phone_number };
        } catch (error) {
            await prisma.instance.update({
                where: { id: instanceId },
                data: { status: 'DISCONNECTED' }
            });
            throw error;
        }
    }

    async connectWithPairingCode(instanceId: string, phoneNumber: string): Promise<{ pairingCode: string }> {
        throw new Error('Pairing code is not supported on Official API. Use Access Token instead.');
    }

    async disconnect(instanceId: string): Promise<void> {
        this.sessions.delete(instanceId);
        await prisma.instance.update({
            where: { id: instanceId },
            data: { status: 'DISCONNECTED' }
        });
        this.emit('disconnected', { instanceId });
    }

    async logout(instanceId: string): Promise<void> {
        await this.disconnect(instanceId);
    }

    async deleteInstance(instanceId: string): Promise<void> {
        await this.disconnect(instanceId);
    }

    getInstance(instanceId: string): any {
        return this.sessions.get(instanceId);
    }

    getAllInstances(): string[] {
        return Array.from(this.sessions.keys());
    }

    getStatus(instanceId: string): "disconnected" | "connecting" | "connected" | "qr" | "not_found" {
        return this.sessions.has(instanceId) ? 'connected' : 'disconnected';
    }

    getQRCode(instanceId: string): { qr?: string; qrBase64?: string } {
        return { qr: undefined, qrBase64: undefined };
    }

    getClient(instanceId: string): any {
        return null;
    }

    async loadInstanceSettings(instanceId: string): Promise<void> {
        // No local settings to load for API
    }

    async updateInstanceSettings(instanceId: string, settings: any): Promise<void> {
        // Settings are stored in DB, nothing to update in memory manager
    }

    async setProxy(instanceId: string, proxy: any): Promise<void> {
        // Proxy not supported for fetch calls directly in this simplified implementation without custom agent
        // TODO: specific proxy agent if needed
    }

    async checkProxy(instanceId: string): Promise<{ ip?: string; error?: string }> {
        return { error: 'Proxy not supported on Official API manager yet' };
    }

    async reconnectAll(): Promise<void> {
        const instances = await prisma.instance.findMany({
            where: { status: 'CONNECTED' }
        });

        for (const instance of instances) {
            try {
                await this.connect(instance.id);
            } catch (error) {
                logger.error({ err: error }, `Failed to reconnect instance ${instance.id}`);
            }
        }
    }

    // ================================
    // Messages
    // ================================

    async sendText(instanceId: string, to: string, text: string): Promise<any> {
        const session = await this.getSession(instanceId);
        return this.apiRequest(instanceId, 'POST', `${session.phoneNumberId}/messages`, {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'text',
            text: { body: text }
        });
    }

    async sendTemplate(instanceId: string, to: string, templateName: string, language: string = 'pt_BR', components: any[] = []): Promise<any> {
        const session = await this.getSession(instanceId);
        return this.apiRequest(instanceId, 'POST', `${session.phoneNumberId}/messages`, {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'template',
            template: {
                name: templateName,
                language: { code: language },
                components: components
            }
        });
    }

    async sendMedia(instanceId: string, to: string, mediaUrl: string, options?: any): Promise<any> {
        const session = await this.getSession(instanceId);

        // Determine type based on options or basic extension check (simplified)
        let type = options?.type || 'image';
        const lowerUrl = mediaUrl.toLowerCase();

        if (!options?.type) {
            if (lowerUrl.endsWith('.mp4')) type = 'video';
            else if (lowerUrl.endsWith('.mp3') || lowerUrl.endsWith('.ogg')) type = 'audio';
            else if (lowerUrl.endsWith('.pdf') || lowerUrl.endsWith('.doc') || lowerUrl.endsWith('.docx')) type = 'document';
            else if (lowerUrl.endsWith('.webp')) type = 'sticker';
        }

        const mediaObject: any = { link: mediaUrl };
        if (options?.caption && type !== 'audio' && type !== 'sticker') {
            mediaObject.caption = options.caption;
        }
        if (options?.filename && type === 'document') {
            mediaObject.filename = options.filename;
        }

        const body: any = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: type,
        };
        body[type] = mediaObject;

        return this.apiRequest(instanceId, 'POST', `${session.phoneNumberId}/messages`, body);
    }

    async sendPoll(instanceId: string, to: string, title: string, options: string[], pollOptions?: any): Promise<any> {
        const session = await this.getSession(instanceId);
        return this.apiRequest(instanceId, 'POST', `${session.phoneNumberId}/messages`, {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'interactive',
            interactive: {
                type: 'button',
                body: { text: title },
                action: {
                    buttons: options.slice(0, 3).map((opt, i) => ({
                        type: 'reply',
                        reply: { id: `btn_${i}`, title: opt.substring(0, 20) }
                    }))
                }
            }
        });
    }

    async sendListMessage(instanceId: string, to: string, buttonText: string, title: string, sections: { title: string; rows: { id: string; title: string; description?: string }[] }[]): Promise<any> {
        const session = await this.getSession(instanceId);
        return this.apiRequest(instanceId, 'POST', `${session.phoneNumberId}/messages`, {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'interactive',
            interactive: {
                type: 'list',
                header: {
                    type: 'text',
                    text: title
                },
                body: {
                    text: title
                },
                action: {
                    button: buttonText,
                    sections: sections
                }
            }
        });
    }

    async sendRealPoll(instanceId: string, to: string, question: string, options: string[], allowMultipleAnswers: boolean = false): Promise<any> {
        // NOTE: Polls via Cloud API might have strictly different structure or be in beta. 
        // This is a best-effort implementation based on current interactive message structures.
        // If 'poll' type isn't supported, one should use Reply Buttons or Lists.
        // As of v19.0, explicit Poll creation via API might require different handling.
        // For now, we will fallback to Reply Buttons if options <= 3, or List if > 3 (simulating a poll).

        if (options.length <= 3) {
            return this.sendPoll(instanceId, to, question, options);
        } else {
            const sections = [{
                title: 'Opções',
                rows: options.map((opt, i) => ({
                    id: `poll_${i}`,
                    title: opt.substring(0, 24) // Title limit
                }))
            }];
            return this.sendListMessage(instanceId, to, 'Ver Opções', question, sections);
        }
    }

    async editMessage(instanceId: string, chatId: string, messageId: string, newText: string): Promise<any> {
        throw new Error('Edit Message not implemented');
    }

    async reactToMessage(instanceId: string, chatId: string, messageId: string, reaction: string): Promise<void> {
        const session = await this.getSession(instanceId);
        return this.apiRequest(instanceId, 'POST', `${session.phoneNumberId}/messages`, {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: chatId,
            type: 'reaction',
            reaction: {
                message_id: messageId,
                emoji: reaction
            }
        });
    }

    async deleteMessage(instanceId: string, chatId: string, messageId: string, forEveryone?: boolean): Promise<void> {
        throw new Error('Delete Message not supported nicely in Cloud API');
    }

    async downloadMedia(instanceId: string, messageId: string, options: any): Promise<any> {
        const session = await this.getSession(instanceId);

        // 1. Get Media URL
        // If messageId is actually a URL (from webhook), use it directly
        let downloadUrl = messageId;

        // If it's an ID, fetch URL from API
        if (!messageId.startsWith('http')) {
            const mediaData = await this.apiRequest(instanceId, 'GET', messageId);
            downloadUrl = mediaData.url;
        }

        // 2. Download Binary
        const response = await fetch(downloadUrl, {
            headers: { 'Authorization': `Bearer ${session.accessToken}` }
        });

        if (!response.ok) {
            throw new Error(`Failed to download media: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // 3. Return Base64 or save to file (depending on options)
        if (options?.returnBase64) {
            const mimetype = response.headers.get('content-type') || 'application/octet-stream';
            return {
                mimetype,
                data: buffer.toString('base64'),
                size: buffer.length
            };
        }

        // TODO: Save to file logic if needed (usually handled by caller or webhook)
        return buffer;
    }

    // ================================
    // Chats / Contacts / Groups
    // ================================

    async getChats(instanceId: string): Promise<any[]> {
        // Return contacts with their latest message
        const contacts = await prisma.contact.findMany({
            where: { instanceId },
            include: {
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            },
            orderBy: { updatedAt: 'desc' }
        });

        return contacts.map(c => ({
            id: c.waId,
            name: c.pushName,
            image: c.profilePictureUrl,
            lastMessage: c.messages[0] ? {
                id: c.messages[0].waMessageId,
                body: c.messages[0].body,
                timestamp: c.messages[0].createdAt.getTime() / 1000
            } : null,
            unreadCount: 0 // TODO: Calculate unread
        }));
    }

    async getChatById(instanceId: string, chatId: string): Promise<any> {
        const contact = await prisma.contact.findUnique({
            where: { instanceId_waId: { instanceId, waId: chatId } }
        });
        return contact;
    }

    async getChatMessages(instanceId: string, chatId: string, options?: any): Promise<any[]> {
        const limit = options?.limit || 50;

        // Find contact first to get internal ID
        const contact = await prisma.contact.findUnique({
            where: { instanceId_waId: { instanceId, waId: chatId } }
        });

        if (!contact) return [];

        const messages = await prisma.message.findMany({
            where: {
                instanceId,
                contactId: contact.id
            },
            orderBy: { createdAt: 'desc' },
            take: limit
        });

        return messages.reverse().map(m => ({
            id: m.waMessageId || m.id,
            from: m.from,
            to: m.to,
            body: m.body,
            mediaUrl: m.mediaUrl,
            mediaType: m.mediaType,
            type: m.mediaType || 'text',
            timestamp: m.createdAt.getTime() / 1000,
            fromMe: m.direction === 'OUTBOUND',
            status: m.status.toLowerCase()
        }));
    }

    async deleteChat(instanceId: string, chatId: string): Promise<void> {
        const contact = await prisma.contact.findUnique({
            where: { instanceId_waId: { instanceId, waId: chatId } }
        });
        if (contact) {
            await prisma.message.deleteMany({
                where: { contactId: contact.id }
            });
            await prisma.contact.delete({
                where: { id: contact.id }
            });
        }
    }

    async archiveChat(instanceId: string, chatId: string): Promise<void> { }
    async unarchiveChat(instanceId: string, chatId: string): Promise<void> { }
    async pinChat(instanceId: string, chatId: string): Promise<void> { }
    async unpinChat(instanceId: string, chatId: string): Promise<void> { }
    async muteChat(instanceId: string, chatId: string, duration?: Date | null): Promise<void> { }
    async unmuteChat(instanceId: string, chatId: string): Promise<void> { }
    async markChatAsUnread(instanceId: string, chatId: string): Promise<void> { }

    async markChatAsRead(instanceId: string, chatId: string, messageId?: string): Promise<void> {
        // Requires message ID, not provided in this interface signature typically. 
        // Ignoring for now or would need to fetch latest message.
    }

    async sendMediaBase64(instanceId: string, to: string, base64: string, mimetype: string, options?: any): Promise<any> {
        throw new Error('Base64 sending not supported directly. Please upload to a URL first.');
    }

    async sendLocation(instanceId: string, to: string, latitude: number, longitude: number, title?: string, address?: string): Promise<any> {
        const session = await this.getSession(instanceId);
        return this.apiRequest(instanceId, 'POST', `${session.phoneNumberId}/messages`, {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'location',
            location: {
                latitude,
                longitude,
                name: title,
                address: address
            }
        });
    }

    async sendContact(instanceId: string, to: string, contactId: string): Promise<any> {
        const session = await this.getSession(instanceId);

        // Fetch contact name if available
        const contact = await prisma.contact.findUnique({
            where: { instanceId_waId: { instanceId, waId: contactId } }
        });
        const name = contact?.pushName || contactId;

        return this.apiRequest(instanceId, 'POST', `${session.phoneNumberId}/messages`, {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'contacts',
            contacts: [{
                name: { formatted_name: name, first_name: name },
                phones: [{ phone: contactId, type: 'CELL', wa_id: contactId }]
            }]
        });
    }

    async sendPresence(instanceId: string, to: string, presence: string): Promise<void> {
        // Interactive presence not fully supported/needed for bots usually
    }

    async getContacts(instanceId: string): Promise<any[]> {
        return prisma.contact.findMany({
            where: { instanceId }
        });
    }

    async getContactById(instanceId: string, contactId: string): Promise<any> {
        return prisma.contact.findUnique({
            where: { instanceId_waId: { instanceId, waId: contactId } }
        });
    }

    async isRegisteredUser(instanceId: string, number: string): Promise<boolean> {
        // TODO: Implement check via API if possible (usually assumes true for messaging)
        return true;
    }

    async blockContact(instanceId: string, contactId: string): Promise<void> { }
    async unblockContact(instanceId: string, contactId: string): Promise<void> { }
    async getBlockedContacts(instanceId: string): Promise<any[]> { return []; }

    async createGroup(instanceId: string, name: string, participants: string[]): Promise<any> { throw new Error('Groups not supported'); }
    async getGroupInfo(instanceId: string, groupId: string): Promise<any> { throw new Error('Groups not supported'); }
    async addParticipants(instanceId: string, groupId: string, participants: string[]): Promise<void> { }
    async removeParticipants(instanceId: string, groupId: string, participants: string[]): Promise<void> { }
    async promoteParticipants(instanceId: string, groupId: string, participants: string[]): Promise<void> { }
    async demoteParticipants(instanceId: string, groupId: string, participants: string[]): Promise<void> { }
    async setGroupSubject(instanceId: string, groupId: string, subject: string): Promise<void> { }
    async setGroupDescription(instanceId: string, groupId: string, description: string): Promise<void> { }
    async leaveGroup(instanceId: string, groupId: string): Promise<void> { }
    async getInviteCode(instanceId: string, groupId: string): Promise<string> { return ''; }
    async revokeInviteCode(instanceId: string, groupId: string): Promise<string> { return ''; }
    async joinGroupByInviteCode(instanceId: string, inviteCode: string): Promise<any> { }

    async getLabels(instanceId: string): Promise<any[]> { return []; }
    async addLabelToChat(instanceId: string, chatId: string, labelId: string): Promise<void> { }
    async removeLabelFromChat(instanceId: string, chatId: string, labelId: string): Promise<void> { }

    async setProfileName(instanceId: string, name: string): Promise<void> { }
    async setStatus(instanceId: string, status: string): Promise<void> { }
    async setProfilePicture(instanceId: string, image: string | Buffer): Promise<void> { }
}

export const waManager = new OfficialWhatsAppManager();
