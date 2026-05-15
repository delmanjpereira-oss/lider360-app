'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

export default function CadastrarPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
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

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErro(null);
    setSucesso(false);

    try {
      // Validação básica
      if (!form.id_groot.trim() || !form.nome.trim()) {
        setErro('ID Groot e Nome são obrigatórios');
        setLoading(false);
        return;
      }

      // Prepara dados (transforma datas vazias em null)
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

      const { error } = await supabase.from('colaboradores').insert(dados);

      if (error) {
        setErro(error.message);
      } else {
        setSucesso(true);
        // Limpa o formulário
        setForm({
          id_groot: '',
          nome: '',
          cargo: '',
          processo: 'Checkin',
          status: 'Ativo',
          carreira: 'REP1',
          data_admissao: '',
          aniversario: '',
        });
        // Auto-dismiss após 3s
        setTimeout(() => setSucesso(false), 3000);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      setErro(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/meu-time')}
          className="text-gray-400 hover:text-white transition-colors"
          aria-label="Voltar"
        >
          ← Voltar
        </button>
      </div>

      <div>
        <h1 className="text-4xl font-black mb-2">
          Novo <span className="text-[#FFD700]">Colaborador</span>
        </h1>
        <p className="text-gray-400">Adicione um colaborador ao seu time</p>
      </div>

      {/* Mensagem de sucesso */}
      {sucesso && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <p className="text-green-400 font-bold">
            Colaborador cadastrado com sucesso!
          </p>
        </div>
      )}

      {/* Mensagem de erro */}
      {erro && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-2xl">❌</span>
          <div>
            <p className="text-red-400 font-bold mb-1">Erro ao cadastrar:</p>
            <p className="text-red-300 text-sm">{erro}</p>
          </div>
        </div>
      )}

      {/* Formulário */}
      <form
        onSubmit={handleSubmit}
        className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 space-y-4"
      >
        {/* ID GROOT */}
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
            placeholder="Ex: 12345"
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white focus:border-[#FFD700] focus:outline-none transition-colors"
          />
        </div>

        {/* Nome */}
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
            placeholder="Ex: Eduardo Silva"
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white focus:border-[#FFD700] focus:outline-none transition-colors"
          />
        </div>

        {/* Cargo */}
        <div>
          <label className="block text-sm font-bold text-gray-300 mb-2">
            Cargo
          </label>
          <input
            type="text"
            name="cargo"
            value={form.cargo}
            onChange={handleChange}
            placeholder="Ex: Operador Checkin"
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white focus:border-[#FFD700] focus:outline-none transition-colors"
          />
        </div>

        {/* Grid 2 colunas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Processo */}
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

          {/* Status */}
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

          {/* Carreira */}
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

          {/* Data Admissão */}
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

          {/* Aniversário */}
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

        {/* Botões */}
        <div className="flex gap-3 pt-4 border-t border-[#2a2a2a]">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-[#FFD700] text-black font-bold py-3 rounded-lg hover:bg-yellow-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Salvando...' : '✅ Cadastrar Colaborador'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/meu-time')}
            className="px-6 py-3 bg-[#2a2a2a] text-white rounded-lg hover:bg-[#3a3a3a] transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
