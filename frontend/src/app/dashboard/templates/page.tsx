'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';

type TemplateItem = {
    id: string;
    name: string;
    body: string;
    createdAt: string;
};

const STORAGE_KEY = 'ofc_templates';

function loadItems(): TemplateItem[] {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw) as TemplateItem[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveItems(items: TemplateItem[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export default function TemplatesPage() {
    const searchParams = useSearchParams();
    const q = (searchParams.get('q') || '').toLowerCase();
    const openCreate = searchParams.get('create') === '1';

    const [items, setItems] = useState<TemplateItem[]>(() => loadItems());
    const [showCreate, setShowCreate] = useState(false);
    const [name, setName] = useState('');
    const [body, setBody] = useState('');

    useEffect(() => {
        if (openCreate) setShowCreate(true);
    }, [openCreate]);

    const filtered = useMemo(() => {
        if (!q) return items;
        return items.filter((i) => i.name.toLowerCase().includes(q) || i.body.toLowerCase().includes(q));
    }, [items, q]);

    const create = () => {
        const trimmed = name.trim();
        if (!trimmed || !body.trim()) return;
        const next: TemplateItem = {
            id: crypto.randomUUID(),
            name: trimmed,
            body: body.trim(),
            createdAt: new Date().toISOString(),
        };
        const updated = [next, ...items];
        setItems(updated);
        saveItems(updated);
        setName('');
        setBody('');
        setShowCreate(false);
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
                    <h2 className="text-2xl font-bold text-gray-800">Templates de mensagem</h2>
                    <p className="text-gray-500 text-sm">Modelos rápidos para envio</p>
                </div>
                <button onClick={() => setShowCreate(true)} className="btn btn-primary h-10 px-4">
                    <Plus className="w-4 h-4" />
                    Criar
                </button>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {filtered.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">Nenhum template encontrado</div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {filtered.map((t) => (
                            <div key={t.id} className="px-6 py-4 flex items-start justify-between gap-6">
                                <div className="min-w-0">
                                    <div className="font-medium text-gray-900 truncate">{t.name}</div>
                                    <div className="text-sm text-gray-600 mt-1 whitespace-pre-wrap break-words">{t.body}</div>
                                </div>
                                <button onClick={() => remove(t.id)} className="btn btn-ghost h-9 px-3 text-red-600 hover:bg-red-50 shrink-0">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {showCreate && (
                <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-2xl border border-gray-100 shadow-xl p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-1">Novo template</h3>
                        <p className="text-sm text-gray-500 mb-4">Nome e conteúdo</p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                                <input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    placeholder="Ex: Boas-vindas"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem</label>
                                <textarea
                                    value={body}
                                    onChange={(e) => setBody(e.target.value)}
                                    className="w-full h-40 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    placeholder="Digite a mensagem..."
                                />
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <button onClick={() => setShowCreate(false)} className="btn btn-ghost h-10 px-4">Cancelar</button>
                            <button onClick={create} className="btn btn-primary h-10 px-4" disabled={!name.trim() || !body.trim()}>Criar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
