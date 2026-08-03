'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import LoadingOverlay, { Fase } from '../../components/LoadingOverlay';
export default function CadastrarPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [fase, setFase] = useState<Fase>(null);
  const [form, setForm] = useState({
    id_groot: '',
    nome: '',
    processo: 'Checkin',
    status: 'Ativo',
    carreira: 'REP 1',
    data_admissao: '',
  });
  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFase('salvando');
    setErro(null);
    setSucesso(false);
    try {
      // Validação básica
      if (!form.id_groot.trim() || !form.nome.trim()) {
        setErro('ID Groot e Nome são obrigatórios');
        setLoading(false);
        setFase(null);
        return;
      }
      // Prepara dados. Carreira = Cargo (mesma coisa): salva nos dois campos
      // pra não deixar o "Cargo" vazio no card do colaborador.
      const dados = {
        id_groot: form.id_groot.trim(),
        nome: form.nome.trim(),
        cargo: form.carreira,
        processo: form.processo,
        status: form.status,
        carreira: form.carreira,
        data_admissao: form.data_admissao || null,
        aniversario: null,
      };
      const { error } = await supabase.from('colaboradores').insert(dados);
      if (error) {
        setErro(error.message);
        setLoading(false);
        setFase(null);
      } else {
        // ✅ Sucesso: mostra overlay e redireciona pro /meu-time
        setSucesso(true);
        setFase('sucesso');
        setTimeout(() => {
          router.push('/meu-time');
        }, 1400);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      setErro(msg);
      setLoading(false);
      setFase(null);
    }
  }
  return (
    <div className="space-y-6 max-w-2xl">
      <LoadingOverlay
        fase={fase}
        salvandoTitulo="Salvando..."
        salvandoSub="Cadastrando o colaborador"
        sucessoTitulo="Cadastrado!"
        sucessoSub="Voltando para o time..."
      />

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
          {/* Carreira (= Cargo) */}
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
              <option value="REP 1">REP 1</option>
              <option value="REP 2">REP 2</option>
              <option value="REP 3">REP 3</option>
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
        </div>
        {/* Botões */}
        <div className="flex gap-3 pt-4 border-t border-[#2a2a2a]">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-[#FFD700] text-black font-black py-3 rounded-lg hover:bg-yellow-300 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-yellow-500/20 hover:shadow-yellow-500/40 hover:-translate-y-0.5 active:scale-[0.99] flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="inline-block w-4 h-4 border-[3px] border-black/30 border-t-black rounded-full animate-spin"></span>
                Salvando...
              </>
            ) : (
              '✅ Cadastrar Colaborador'
            )}
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
