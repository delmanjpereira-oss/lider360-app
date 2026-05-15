'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../../lib/supabase';

export default function EditarColaboradorPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  const [form, setForm] = useState({
    id_groot: '',
    nome: '',
    cargo: '',
    processo: 'Checkin',
    status: 'Ativo',
    carreira: 'REP1',
    data_admissao: '',
    aniversario: '',
  });

  useEffect(() => {
    async function buscar() {
      try {
        const { data, error } = await supabase
          .from('colaboradores')
          .select('*')
          .eq('id', parseInt(id))
          .single();

        if (error) {
          setErro(error.message);
        } else if (data) {
          setForm({
            id_groot: data.id_groot || '',
            nome: data.nome || '',
            cargo: data.cargo || '',
            processo: data.processo || 'Checkin',
            status: data.status || 'Ativo',
            carreira: data.carreira || 'REP1',
            data_admissao: data.data_admissao || '',
            aniversario: data.aniversario || '',
          });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Erro desconhecido';
        setErro(msg);
      } finally {
        setLoading(false);
      }
    }
    buscar();
  }, [id]);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    setSucesso(false);

    try {
      if (!form.id_groot.trim() || !form.nome.trim()) {
        setErro('ID Groot e Nome são obrigatórios');
        setSalvando(false);
        return;
      }

      const dados = {
        id_groot: form.id_groot.trim(),
        nome: form.nome.trim(),
        cargo: form.cargo.trim() || null,
        processo: form.processo,
        status: form.status,
        carreira: form.carreira,
        data_admissao: form.data_admissao || null,
        aniversario: form.aniversario || null,
      };

      const { error } = await supabase
        .from('colaboradores')
        .update(dados)
        .eq('id', parseInt(id));

      if (error) {
        setErro(error.message);
      } else {
        setSucesso(true);
        setTimeout(() => {
          router.push(`/meu-time/${id}`);
        }, 1500);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      setErro(msg);
    } finally {
      setSalvando(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-12 text-center">
        <span className="text-6xl block mb-4">⏳</span>
        <p className="text-gray-400">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Link
        href={`/meu-time/${id}`}
        className="text-gray-400 hover:text-white transition-colors inline-flex items-center gap-2"
      >
        ← Voltar
      </Link>

      <div>
        <h1 className="text-4xl font-black mb-2">
          Editar <span className="text-[#FFD700]">Colaborador</span>
        </h1>
        <p className="text-gray-400">Atualize os dados do colaborador</p>
      </div>

      {sucesso && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <p className="text-green-400 font-bold">
            Atualizado! Redirecionando...
          </p>
        </div>
      )}

      {erro && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-2xl">❌</span>
          <div>
            <p className="text-red-400 font-bold mb-1">Erro:</p>
            <p className="text-red-300 text-sm">{erro}</p>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 space-y-4"
      >
        <div>
          <label className="block text-sm font-bold text-gray-300 mb-2">
            ID GROOT <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            name="id_groot"
            value={form.id_groot}
            onChange={handleChange}
            required
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white focus:border-[#FFD700] focus:outline-none transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-300 mb-2">
            Nome <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            name="nome"
            value={form.nome}
            onChange={handleChange}
            required
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white focus:border-[#FFD700] focus:outline-none transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-300 mb-2">
            Cargo
          </label>
          <input
            type="text"
            name="cargo"
            value={form.cargo}
            onChange={handleChange}
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white focus:border-[#FFD700] focus:outline-none transition-colors"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-gray-300 mb-2">
              Processo
            </label>
            <select
              name="processo"
              value={form.processo}
              onChange={handleChange}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white focus:border-[#FFD700] focus:outline-none transition-colors"
            >
              <option value="Checkin">Checkin</option>
              <option value="P2M">P2M</option>
              <option value="Sorting">Sorting</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-300 mb-2">
              Status
            </label>
            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white focus:border-[#FFD700] focus:outline-none transition-colors"
            >
              <option value="Ativo">Ativo</option>
              <option value="Inativo">Inativo</option>
              <option value="Afastado">Afastado</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-300 mb-2">
              Carreira
            </label>
            <select
              name="carreira"
              value={form.carreira}
              onChange={handleChange}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white focus:border-[#FFD700] focus:outline-none transition-colors"
            >
              <option value="REP1">REP1</option>
              <option value="REP2">REP2</option>
              <option value="REP3">REP3</option>
              <option value="MULTIPLICADOR">MULTIPLICADOR</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-300 mb-2">
              Data de Admissão
            </label>
            <input
              type="date"
              name="data_admissao"
              value={form.data_admissao}
              onChange={handleChange}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white focus:border-[#FFD700] focus:outline-none transition-colors"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-bold text-gray-300 mb-2">
              Aniversário
            </label>
            <input
              type="date"
              name="aniversario"
              value={form.aniversario}
              onChange={handleChange}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white focus:border-[#FFD700] focus:outline-none transition-colors"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-[#2a2a2a]">
          <button
            type="submit"
            disabled={salvando}
            className="flex-1 bg-[#FFD700] text-black font-bold py-3 rounded-lg hover:bg-yellow-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {salvando ? 'Salvando...' : '💾 Salvar Alterações'}
          </button>
          <Link
            href={`/meu-time/${id}`}
            className="px-6 py-3 bg-[#2a2a2a] text-white rounded-lg hover:bg-[#3a3a3a] transition-colors text-center"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
