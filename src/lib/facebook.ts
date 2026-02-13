import { env } from '../config/env.js';
import { logger } from './logger.js';

const FB_API_URL = 'https://graph.facebook.com';

export class FacebookService {
    private get baseUrl() {
        return `${FB_API_URL}/${env.fbApiVersion}`;
    }

    /**
     * Exchange an authorization code for an access token (COEX)
     */
    async exchangeCodeForToken(code: string): Promise<string> {
        if (!env.fbAppId || !env.fbAppSecret) {
            throw new Error('Facebook App ID and Secret not configured');
        }

        const url = `${this.baseUrl}/oauth/access_token?client_id=${env.fbAppId}&client_secret=${env.fbAppSecret}&code=${code}`;

        const response = await fetch(url);
        const data = await response.json() as any;

        if (data.error) {
            logger.error({ error: data.error }, 'Failed to exchange code for token');
            throw new Error(data.error.message);
        }

        return data.access_token;
    }

    /**
     * Exchange a short-lived user access token for a long-lived one
     */
    async exchangeForLongLivedToken(shortLivedToken: string): Promise<string> {
        if (!env.fbAppId || !env.fbAppSecret) {
            throw new Error('Facebook App ID and Secret not configured');
        }

        const url = `${this.baseUrl}/oauth/access_token?grant_type=fb_exchange_token&client_id=${env.fbAppId}&client_secret=${env.fbAppSecret}&fb_exchange_token=${shortLivedToken}`;

        const response = await fetch(url);
        const data = await response.json() as any;

        if (data.error) {
            logger.error({ error: data.error }, 'Failed to exchange token');
            throw new Error(data.error.message);
        }

        return data.access_token;
    }

    /**
     * Get details about the WABA (WhatsApp Business Account)
     */
    async getWABAInfo(wabaId: string, accessToken: string) {
        const url = `${this.baseUrl}/${wabaId}?fields=id,name,currency,timezone_id,message_template_namespace`;
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const data = await response.json() as any;

        if (data.error) {
            throw new Error(data.error.message);
        }

        return data;
    }

    /**
     * Get Phone Number details
     */
    async getPhoneNumberInfo(phoneNumberId: string, accessToken: string) {
        const url = `${this.baseUrl}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`;
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const data = await response.json() as any;

        if (data.error) {
            throw new Error(data.error.message);
        }

        return data;
    }

    /**
     * Subscribe App to WABA Webhooks
     */
    async subscribeAppToWABA(wabaId: string, accessToken: string) {
        const url = `${this.baseUrl}/${wabaId}/subscribed_apps`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const data = await response.json() as any;

        if (data.error) {
            logger.error({ error: data.error, wabaId }, 'Failed to subscribe app to WABA');
            // Don't throw here, usually not critical if already subscribed
            return false;
        }

        return data.success;
    }

    /**
     * Register phone number (if needed)
     */
    async registerPhoneNumber(phoneNumberId: string, accessToken: string, pin: string) {
        const url = `${this.baseUrl}/${phoneNumberId}/register`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                pin: pin
            })
        });
        const data = await response.json() as any;

        if (data.error) {
            throw new Error(data.error.message);
        }

        return data.success;
    }
}

export const facebookService = new FacebookService();
