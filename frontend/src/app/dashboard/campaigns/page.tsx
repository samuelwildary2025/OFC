'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useSearchParams } from 'next/navigation';
import {
    Megaphone,
    Plus,
    RefreshCw,
    Play,
    Pause,
    RotateCcw,
    Ban,
    Trash2,
    Loader2,
    X
} from 'lucide-react';
import toast from 'react-hot-toast';

type InstanceItem = {
    id: string;
    name: string;
    status: string;
};

type CampaignItem = {
    id: string;
    name: string;
    status: 'PENDING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
    instance: { id: string; name: string };
    totalMessages: number;
    sentMessages: number;
    failedMessages: number;
    progress: number;
    createdAt: string;
    startedAt?: string | null;
    completedAt?: string | null;
};

function parseRecipients(input: string): string[] {
    return input
        .split(/\s|,|;|\n/)
        .map((v) => v.trim())
        .filter(Boolean);
}

export default function CampaignsPage() {
    const searchParams = useSearchParams();
    const createParam = searchParams.get('create') === '1';
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [instances, setInstances] = useState<InstanceItem[]>([]);
    const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);

    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [formName, setFormName] = useState('');
    const [formInstanceId, setFormInstanceId] = useState('');
    const [formType, setFormType] = useState<'text' | 'media'>('text');
    const [formText, setFormText] = useState('');
    const [formMediaUrl, setFormMediaUrl] = useState('');
    const [formCaption, setFormCaption] = useState('');
    const [formRecipients, setFormRecipients] = useState('');
    const [formDelay, setFormDelay] = useState(5000);

    const canCreate = useMemo(() => {
        const recipients = parseRecipients(formRecipients);
        if (!formName.trim() || !formInstanceId || recipients.length === 0) return false;
        if (formType === 'text') return Boolean(formText.trim());
        return Boolean(formMediaUrl.trim());
    }, [formName, formInstanceId, formRecipients, formType, formText, formMediaUrl]);

    const loadAll = async () => {
        const [instancesRes, campaignsRes] = await Promise.all([
            api.getInstances(),
            api.getCampaigns(),
        ]);
        setInstances((instancesRes.data as InstanceItem[]) || []);
        setCampaigns((campaignsRes.data as CampaignItem[]) || []);
    };

    useEffect(() => {
        const run = async () => {
            try {
                await loadAll();
            } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Erro ao carregar campanhas');
            } finally {
                setIsLoading(false);
            }
        };
        run();
    }, []);

    useEffect(() => {
        if (createParam) setShowCreate(true);
    }, [createParam]);

    const refresh = async () => {
        setIsRefreshing(true);
        try {
            await loadAll();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Erro ao atualizar');
        } finally {
            setIsRefreshing(false);
        }
    };

    const resetCreateForm = () => {
        setFormName('');
        setFormInstanceId('');
        setFormType('text');
        setFormText('');
        setFormMediaUrl('');
        setFormCaption('');
        setFormRecipients('');
        setFormDelay(5000);
    };

    const createCampaign = async () => {
        if (!canCreate) return;
        setCreating(true);
        try {
            const recipients = parseRecipients(formRecipients);
            await api.createSimpleCampaign({
                name: formName.trim(),
                instanceId: formInstanceId,
                message:
                    formType === 'text'
                        ? { type: 'text', text: formText.trim() }
                        : { type: 'media', mediaUrl: formMediaUrl.trim(), caption: formCaption.trim() || undefined },
                recipients,
                delay: formDelay,
            });
            toast.success('Campanha criada');
            setShowCreate(false);
            resetCreateForm();
            await refresh();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Erro ao criar campanha');
        } finally {
            setCreating(false);
        }
    };

    const startCampaign = async (id: string) => {
        try {
            await api.startCampaign(id);
            toast.success('Campanha iniciada');
            await refresh();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Erro ao iniciar');
        }
    };

    const controlCampaign = async (id: string, action: 'pause' | 'resume' | 'cancel') => {
        try {
            await api.controlCampaign(id, action);
            toast.success('Ação executada');
            await refresh();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Erro ao executar ação');
        }
    };

    const deleteCampaign = async (id: string) => {
        if (!confirm('Excluir esta campanha?')) return;
        try {
            await api.deleteCampaign(id);
            toast.success('Campanha excluída');
            await refresh();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Erro ao excluir');
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Campanhas</h2>
                    <p className="text-gray-500 text-sm">Crie e envie campanhas em lote</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={refresh}
                        className="btn btn-outline h-10 px-4"
                        disabled={isRefreshing}
                    >
                        <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                        Atualizar
                    </button>
                    <button
                        onClick={() => setShowCreate(true)}
                        className="btn btn-primary h-10 px-4"
                    >
                        <Plus className="w-4 h-4" />
                        Criar
                    </button>
                </div>
            </div>

            {campaigns.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
                    <Megaphone className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <h4 className="font-semibold mb-2 text-gray-800">Nenhuma campanha</h4>
                    <p className="text-gray-500">Crie sua primeira campanha para começar</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-gray-50 text-gray-600">
                                <tr>
                                    <th className="px-6 py-3 text-left font-semibold">Nome</th>
                                    <th className="px-6 py-3 text-left font-semibold">Instância</th>
                                    <th className="px-6 py-3 text-left font-semibold">Status</th>
                                    <th className="px-6 py-3 text-left font-semibold">Progresso</th>
                                    <th className="px-6 py-3 text-right font-semibold">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {campaigns.map((c) => (
                                    <tr key={c.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-gray-900">{c.name}</div>
                                            <div className="text-xs text-gray-500">
                                                {c.sentMessages}/{c.totalMessages} enviados • {c.failedMessages} falhas
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-700">{c.instance?.name || '-'}</td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                                                {c.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="w-48 max-w-full">
                                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-2 bg-teal-500"
                                                        style={{ width: `${Math.min(100, Math.max(0, c.progress || 0))}%` }}
                                                    />
                                                </div>
                                                <div className="text-xs text-gray-500 mt-1">{c.progress || 0}%</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-end gap-2">
                                                {c.status === 'PENDING' && (
                                                    <button
                                                        onClick={() => startCampaign(c.id)}
                                                        className="btn btn-primary h-9 px-3"
                                                    >
                                                        <Play className="w-4 h-4" />
                                                        Iniciar
                                                    </button>
                                                )}
                                                {c.status === 'RUNNING' && (
                                                    <button
                                                        onClick={() => controlCampaign(c.id, 'pause')}
                                                        className="btn btn-outline h-9 px-3"
                                                    >
                                                        <Pause className="w-4 h-4" />
                                                        Pausar
                                                    </button>
                                                )}
                                                {c.status === 'PAUSED' && (
                                                    <button
                                                        onClick={() => controlCampaign(c.id, 'resume')}
                                                        className="btn btn-primary h-9 px-3"
                                                    >
                                                        <RotateCcw className="w-4 h-4" />
                                                        Retomar
                                                    </button>
                                                )}
                                                {(c.status === 'PENDING' || c.status === 'RUNNING' || c.status === 'PAUSED') && (
                                                    <button
                                                        onClick={() => controlCampaign(c.id, 'cancel')}
                                                        className="btn btn-outline h-9 px-3"
                                                    >
                                                        <Ban className="w-4 h-4" />
                                                        Cancelar
                                                    </button>
                                                )}
                                                {c.status !== 'RUNNING' && (
                                                    <button
                                                        onClick={() => deleteCampaign(c.id)}
                                                        className="btn btn-ghost h-9 px-3 text-red-600 hover:bg-red-50"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {showCreate && (
                <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-xl border border-gray-100 shadow-xl">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Criar campanha</h3>
                                <p className="text-sm text-gray-500">Mensagem em lote</p>
                            </div>
                            <button
                                onClick={() => {
                                    setShowCreate(false);
                                    resetCreateForm();
                                }}
                                className="p-2 rounded-lg hover:bg-gray-50"
                            >
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                                <input
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    placeholder="Ex: Oferta Fevereiro"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Canal</label>
                                    <select
                                        value={formInstanceId}
                                        onChange={(e) => setFormInstanceId(e.target.value)}
                                        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    >
                                        <option value="">Selecione</option>
                                        {instances.map((i) => (
                                            <option key={i.id} value={i.id}>
                                                {i.name} ({i.status})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Delay (ms)</label>
                                    <input
                                        type="number"
                                        value={formDelay}
                                        onChange={(e) => setFormDelay(Math.max(1000, parseInt(e.target.value || '0', 10)))}
                                        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                        min={1000}
                                        max={60000}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                                    <select
                                        value={formType}
                                        onChange={(e) => setFormType(e.target.value as 'text' | 'media')}
                                        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    >
                                        <option value="text">Texto</option>
                                        <option value="media">Mídia (URL)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Destinatários</label>
                                    <div className="text-xs text-gray-500 mb-1">Separe por linha, espaço ou vírgula</div>
                                    <textarea
                                        value={formRecipients}
                                        onChange={(e) => setFormRecipients(e.target.value)}
                                        className="w-full h-[82px] rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                        placeholder="5511999999999\n5511888888888"
                                    />
                                </div>
                            </div>

                            {formType === 'text' ? (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem</label>
                                    <textarea
                                        value={formText}
                                        onChange={(e) => setFormText(e.target.value)}
                                        className="w-full h-28 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                        placeholder="Digite sua mensagem"
                                    />
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">URL da mídia</label>
                                        <input
                                            value={formMediaUrl}
                                            onChange={(e) => setFormMediaUrl(e.target.value)}
                                            className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                            placeholder="https://..."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Legenda (opcional)</label>
                                        <input
                                            value={formCaption}
                                            onChange={(e) => setFormCaption(e.target.value)}
                                            className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                            placeholder="Legenda"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
                            <button
                                className="btn btn-ghost h-10 px-4"
                                onClick={() => {
                                    setShowCreate(false);
                                    resetCreateForm();
                                }}
                                disabled={creating}
                            >
                                Cancelar
                            </button>
                            <button
                                className="btn btn-primary h-10 px-4"
                                onClick={createCampaign}
                                disabled={!canCreate || creating}
                            >
                                {creating ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Criando...
                                    </>
                                ) : (
                                    'Criar campanha'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
