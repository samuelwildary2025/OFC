'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

type TriggerItem = {
    id: string;
    name: string;
    enabled: boolean;
    createdAt: string;
};

const STORAGE_KEY = 'ofc_triggers';

function loadItems(): TriggerItem[] {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw) as TriggerItem[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveItems(items: TriggerItem[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export default function TriggersPage() {
    const searchParams = useSearchParams();
    const q = (searchParams.get('q') || '').toLowerCase();
    const openCreate = searchParams.get('create') === '1';

    const [items, setItems] = useState<TriggerItem[]>(() => loadItems());
    const [showCreate, setShowCreate] = useState(false);
    const [name, setName] = useState('');

    useEffect(() => {
        if (openCreate) setShowCreate(true);
    }, [openCreate]);

    const filtered = useMemo(() => {
        if (!q) return items;
        return items.filter((i) => i.name.toLowerCase().includes(q));
    }, [items, q]);

    const create = () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const next: TriggerItem = {
            id: crypto.randomUUID(),
            name: trimmed,
            enabled: true,
            createdAt: new Date().toISOString(),
        };
        const updated = [next, ...items];
        setItems(updated);
        saveItems(updated);
        setName('');
        setShowCreate(false);
    };

    const toggle = (id: string) => {
        const updated = items.map((i) => (i.id === id ? { ...i, enabled: !i.enabled } : i));
        setItems(updated);
        saveItems(updated);
    };

    const remove = (id: string) => {
        const updated = items.filter((i) => i.id !== id);
        setItems(updated);
        saveItems(updated);
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Gatilhos</h2>
                    <p className="text-gray-500 text-sm">Automatize ações com condições</p>
                </div>
                <button onClick={() => setShowCreate(true)} className="btn btn-primary h-10 px-4">
                    <Plus className="w-4 h-4" />
                    Criar
                </button>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {filtered.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">Nenhum gatilho encontrado</div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {filtered.map((t) => (
                            <div key={t.id} className="px-6 py-4 flex items-center justify-between">
                                <div>
                                    <div className="font-medium text-gray-900">{t.name}</div>
                                    <div className="text-xs text-gray-500">
                                        Criado em {new Date(t.createdAt).toLocaleString('pt-BR')}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => toggle(t.id)} className="btn btn-ghost h-9 px-3">
                                        {t.enabled ? (
                                            <ToggleRight className="w-5 h-5 text-teal-500" />
                                        ) : (
                                            <ToggleLeft className="w-5 h-5 text-gray-400" />
                                        )}
                                    </button>
                                    <button onClick={() => remove(t.id)} className="btn btn-ghost h-9 px-3 text-red-600 hover:bg-red-50">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {showCreate && (
                <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg border border-gray-100 shadow-xl p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-1">Novo gatilho</h3>
                        <p className="text-sm text-gray-500 mb-4">Dê um nome para identificar</p>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                            placeholder="Ex: Responder após compra"
                            autoFocus
                        />
                        <div className="mt-6 flex justify-end gap-2">
                            <button onClick={() => setShowCreate(false)} className="btn btn-ghost h-10 px-4">Cancelar</button>
                            <button onClick={create} className="btn btn-primary h-10 px-4" disabled={!name.trim()}>Criar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
