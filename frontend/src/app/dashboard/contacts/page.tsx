'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';

type ContactItem = {
    id: string;
    name: string;
    phone: string;
    createdAt: string;
};

const STORAGE_KEY = 'ofc_contacts';

function loadItems(): ContactItem[] {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw) as ContactItem[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveItems(items: ContactItem[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export default function ContactsPage() {
    const searchParams = useSearchParams();
    const q = (searchParams.get('q') || '').toLowerCase();
    const openCreate = searchParams.get('create') === '1';

    const [items, setItems] = useState<ContactItem[]>(() => loadItems());
    const [showCreate, setShowCreate] = useState(false);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');

    useEffect(() => {
        if (openCreate) setShowCreate(true);
    }, [openCreate]);

    const filtered = useMemo(() => {
        if (!q) return items;
        return items.filter((i) => i.name.toLowerCase().includes(q) || i.phone.toLowerCase().includes(q));
    }, [items, q]);

    const create = () => {
        const trimmedName = name.trim();
        const trimmedPhone = phone.trim();
        if (!trimmedName || !trimmedPhone) return;
        const next: ContactItem = {
            id: crypto.randomUUID(),
            name: trimmedName,
            phone: trimmedPhone,
            createdAt: new Date().toISOString(),
        };
        const updated = [next, ...items];
        setItems(updated);
        saveItems(updated);
        setName('');
        setPhone('');
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
                    <h2 className="text-2xl font-bold text-gray-800">Meus contatos</h2>
                    <p className="text-gray-500 text-sm">Cadastre e organize sua base</p>
                </div>
                <button onClick={() => setShowCreate(true)} className="btn btn-primary h-10 px-4">
                    <Plus className="w-4 h-4" />
                    Criar
                </button>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {filtered.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">Nenhum contato encontrado</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-gray-50 text-gray-600">
                                <tr>
                                    <th className="px-6 py-3 text-left font-semibold">Nome</th>
                                    <th className="px-6 py-3 text-left font-semibold">Telefone</th>
                                    <th className="px-6 py-3 text-right font-semibold">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filtered.map((c) => (
                                    <tr key={c.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 text-gray-900 font-medium">{c.name}</td>
                                        <td className="px-6 py-4 text-gray-700">{c.phone}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex justify-end">
                                                <button onClick={() => remove(c.id)} className="btn btn-ghost h-9 px-3 text-red-600 hover:bg-red-50">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {showCreate && (
                <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg border border-gray-100 shadow-xl p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-1">Novo contato</h3>
                        <p className="text-sm text-gray-500 mb-4">Nome e WhatsApp</p>

                        <div className="grid grid-cols-1 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                                <input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    placeholder="Ex: João"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                                <input
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    placeholder="Ex: 5511999999999"
                                />
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <button onClick={() => setShowCreate(false)} className="btn btn-ghost h-10 px-4">Cancelar</button>
                            <button onClick={create} className="btn btn-primary h-10 px-4" disabled={!name.trim() || !phone.trim()}>Criar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
