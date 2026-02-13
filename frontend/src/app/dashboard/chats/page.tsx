'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Loader2, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';

type Thread = {
    instanceId: string;
    contact: {
        id: string;
        waId: string;
        pushName: string | null;
        profilePictureUrl: string | null;
        instanceId: string;
    };
    lastMessage: {
        id: string;
        body: string | null;
        mediaType: string | null;
        createdAt: string;
        direction: string;
    };
};

type InboxMessage = {
    id: string;
    direction: string;
    from: string;
    to: string;
    body: string | null;
    mediaUrl: string | null;
    mediaType: string | null;
    status: string;
    createdAt: string;
};

export default function ChatsPage() {
    const searchParams = useSearchParams();
    const q = searchParams.get('q') || '';

    const [loadingThreads, setLoadingThreads] = useState(true);
    const [threads, setThreads] = useState<Thread[]>([]);
    const [selected, setSelected] = useState<{ instanceId: string; contactId: string } | null>(null);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [messages, setMessages] = useState<InboxMessage[]>([]);

    const filteredThreads = useMemo(() => {
        if (!q.trim()) return threads;
        const query = q.toLowerCase();
        return threads.filter((t) => {
            const name = (t.contact.pushName || '').toLowerCase();
            const wa = (t.contact.waId || '').toLowerCase();
            const body = (t.lastMessage.body || '').toLowerCase();
            return name.includes(query) || wa.includes(query) || body.includes(query);
        });
    }, [threads, q]);

    const loadThreads = async () => {
        setLoadingThreads(true);
        try {
            const res = await api.getInboxThreads({ q: q.trim() || undefined, limit: 50 });
            setThreads((res.data as Thread[]) || []);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Erro ao carregar conversas');
        } finally {
            setLoadingThreads(false);
        }
    };

    const loadMessages = async (instanceId: string, contactId: string) => {
        setLoadingMessages(true);
        try {
            const res = await api.getInboxMessages({ instanceId, contactId, limit: 100 });
            setMessages((res.data as InboxMessage[]) || []);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Erro ao carregar mensagens');
        } finally {
            setLoadingMessages(false);
        }
    };

    useEffect(() => {
        loadThreads();
    }, []);

    useEffect(() => {
        if (!selected) return;
        loadMessages(selected.instanceId, selected.contactId);
    }, [selected]);

    if (loadingThreads) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden h-[calc(100vh-11rem)]">
            <div className="grid grid-cols-1 md:grid-cols-3 h-full">
                <div className="border-r border-gray-100 overflow-y-auto">
                    <div className="px-5 py-4 border-b border-gray-100">
                        <h2 className="text-lg font-bold text-gray-900">Bate-papo</h2>
                        <p className="text-sm text-gray-500">Mensagens recebidas e enviadas</p>
                    </div>
                    {filteredThreads.length === 0 ? (
                        <div className="p-10 text-center text-gray-500">
                            Nenhuma conversa encontrada
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-50">
                            {filteredThreads.map((t) => {
                                const isSelected = selected?.instanceId === t.instanceId && selected?.contactId === t.contact.id;
                                return (
                                    <button
                                        key={`${t.instanceId}:${t.contact.id}`}
                                        className={`w-full text-left px-5 py-4 hover:bg-gray-50 transition-colors ${isSelected ? 'bg-teal-50' : ''}`}
                                        onClick={() => setSelected({ instanceId: t.instanceId, contactId: t.contact.id })}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="font-medium text-gray-900 truncate">
                                                    {t.contact.pushName || t.contact.waId}
                                                </div>
                                                <div className="text-xs text-gray-500 truncate">{t.contact.waId}</div>
                                                <div className="text-sm text-gray-600 truncate mt-1">
                                                    {t.lastMessage.body || (t.lastMessage.mediaType ? `[${t.lastMessage.mediaType}]` : '')}
                                                </div>
                                            </div>
                                            <div className="text-xs text-gray-400 shrink-0">
                                                {new Date(t.lastMessage.createdAt).toLocaleDateString('pt-BR')}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="md:col-span-2 flex flex-col h-full">
                    {!selected ? (
                        <div className="flex-1 flex items-center justify-center text-gray-500">
                            <div className="text-center">
                                <MessageSquare className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                                Selecione uma conversa
                            </div>
                        </div>
                    ) : loadingMessages ? (
                        <div className="flex-1 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-gray-50">
                            {messages.length === 0 ? (
                                <div className="text-center text-gray-500">Sem mensagens</div>
                            ) : (
                                messages.map((m) => {
                                    const outbound = m.direction === 'OUTBOUND';
                                    return (
                                        <div key={m.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm ${outbound ? 'bg-teal-500 text-white' : 'bg-white text-gray-900 border border-gray-100'}`}>
                                                <div className="whitespace-pre-wrap break-words">
                                                    {m.body || (m.mediaType ? `[${m.mediaType}]` : '')}
                                                </div>
                                                <div className={`mt-1 text-[11px] ${outbound ? 'text-white/80' : 'text-gray-400'}`}>
                                                    {new Date(m.createdAt).toLocaleString('pt-BR')}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

