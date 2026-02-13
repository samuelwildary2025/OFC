'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

type FacebookSDK = {
    init: (config: {
        appId: string;
        cookie: boolean;
        xfbml: boolean;
        version: string;
    }) => void;
    login: (cb: (response: unknown) => void, config: Record<string, unknown>) => void;
};

type EmbeddedSignupMessage = {
    type?: string;
    event?: string;
    data?: {
        waba_id?: string;
        wabaId?: string;
        wabaID?: string;
        waba?: string;
        phone_number_id?: string;
        phoneNumberId?: string;
        phoneNumberID?: string;
        phone_number?: string;
        event?: string;
        type?: string;
    };
    waba_id?: string;
    wabaId?: string;
    wabaID?: string;
    waba?: string;
    phone_number_id?: string;
    phoneNumberId?: string;
    phoneNumberID?: string;
    phone_number?: string;
};

interface FacebookLoginProps {
    instanceId: string;
    onSuccess?: () => void;
    onError?: (error: string) => void;
    className?: string;
}

export default function FacebookLogin({ instanceId, onSuccess, onError, className }: FacebookLoginProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [sdkLoaded, setSdkLoaded] = useState(false);
    const authRef = useRef<{ code?: string; accessToken?: string } | null>(null);
    const signupRef = useRef<{ wabaId: string; phoneNumberId: string } | null>(null);

    const completeSignup = useCallback(async () => {
        const auth = authRef.current;
        const signup = signupRef.current;
        if (!auth || !signup) return;

        try {
            await api.embeddedSignupInstance(instanceId, {
                code: auth.code,
                accessToken: auth.accessToken,
                wabaId: signup.wabaId,
                phoneNumberId: signup.phoneNumberId,
            });
            setIsLoading(false);
            onSuccess?.();
        } catch (error) {
            setIsLoading(false);
            if (error instanceof Error) {
                onError?.(error.message);
            } else {
                onError?.('Falha ao conectar com a Meta');
            }
        }
    }, [instanceId, onSuccess, onError]);

    useEffect(() => {
        const loadSdk = () => {
            if (document.getElementById('facebook-jssdk')) {
                setSdkLoaded(true);
                return;
            }

            const script = document.createElement('script');
            script.id = 'facebook-jssdk';
            script.src = "https://connect.facebook.net/en_US/sdk.js";
            script.async = true;
            script.defer = true;
            script.onload = () => {
                setSdkLoaded(true);
            };
            document.body.appendChild(script);

            const windowWithFb = window as Window & {
                FB?: FacebookSDK;
                fbAsyncInit?: () => void;
            };

            windowWithFb.fbAsyncInit = function () {
                windowWithFb.FB?.init({
                    appId: process.env.NEXT_PUBLIC_FB_APP_ID || '',
                    cookie: true,
                    xfbml: true,
                    version: 'v19.0'
                });
            };
        };

        loadSdk();
    }, []);

    useEffect(() => {
        const handler = (event: MessageEvent) => {
            const origin = event.origin || '';
            if (!origin.includes('facebook.com') && !origin.includes('meta.com')) {
                return;
            }

            const payload = event.data as EmbeddedSignupMessage | undefined;
            if (!payload) return;

            const data = payload.data || payload;
            const wabaId = data.waba_id || data.wabaId || data.wabaID || data.waba;
            const phoneNumberId = data.phone_number_id || data.phoneNumberId || data.phoneNumberID || data.phone_number;
            const eventType = payload.event || data.event || payload.type || data.type;

            if (!wabaId || !phoneNumberId) return;
            signupRef.current = { wabaId, phoneNumberId };
            if (eventType && typeof eventType === 'string' && eventType.toLowerCase().includes('cancel')) {
                setIsLoading(false);
                onError?.('Conexão cancelada');
                return;
            }

            void completeSignup();
        };

        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [completeSignup, onError]);

    const launchWhatsAppSignup = () => {
        const appId = process.env.NEXT_PUBLIC_FB_APP_ID;
        if (!appId) {
            onError?.('App ID da Meta não configurado');
            return;
        }

        setIsLoading(true);

        const fbLoginCallback = (response: unknown) => {
            const authResponse = (response as { authResponse?: { code?: string; accessToken?: string } })?.authResponse;
            if (authResponse) {
                authRef.current = {
                    code: authResponse.code,
                    accessToken: authResponse.accessToken,
                };
                void completeSignup();
            } else {
                setIsLoading(false);
                onError?.('Login cancelado ou não autorizado');
            }
        };

        const config = {
            scope: 'whatsapp_business_management,  whatsapp_business_messaging',
            response_type: 'code',
            override_default_response_type: true,
            extras: {
                feature: 'whatsapp_embedded_signup',
                version: 2
            }
        };

        const fb = (window as Window & { FB?: FacebookSDK }).FB;
        if (!fb) {
            setIsLoading(false);
            onError?.('SDK da Meta não carregou');
            return;
        }
        fb.login(fbLoginCallback, config);
    };

    return (
        <button
            onClick={launchWhatsAppSignup}
            disabled={isLoading || !sdkLoaded}
            className={`flex items-center justify-center gap-2 bg-[#1877F2] hover:bg-[#166fe5] text-white px-4 py-2 rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className || ''}`}
        >
            {isLoading ? 'Conectando...' : 'Conectar com Facebook'}
        </button>
    );
}
