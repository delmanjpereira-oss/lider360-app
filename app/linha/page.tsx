'use client';
import { useState, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

// ============================================
// 📥 UPLOAD DO CSV DE OCUPAÇÃO
// Tabela: ocupacao (sem data — cada upload substitui o anterior)
// A referência de período é a mesma da produtividade (controlada por você).
// ============================================

type LinhaOcupacao = {
  user_id: string;
  supervisor: string;
  team_leader: string;
  rep: string;
  qtd_totes: number;
  ocupacao_pct: number;
};

// Parser de CSV com suporte a campos entre aspas (ex: "88,03%")
function parseCSV(texto: string, sep: string): string[][] {
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let dentroAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentroAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else dentroAspas = false;
      } else campo += c;
    } else {
      if (c === '"') dentroAspas = true;
      else if (c === sep) { linha.push(campo); campo = ''; }
      else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
      else if (c !== '\r') campo += c;
    }
  }
  if (campo.length > 0 || linha.length > 0) { linha.push(campo); linhas.push(linha); }
  return linhas.filter((l) => l.some((x) => x.trim() !== ''));
}

// "88,03%" → 88.03  |  "73,6%" → 73.6  |  "" → null
function converterPct(raw: string): number | null {
  const limpo = raw.replace('%', '').replace(/\s/g, '').replace(',', '.').trim();
  if (limpo === '') return null;
  const n = Number(limpo);
  return isNaN(n) ? null : n;
}

export default function UploadOcupacaoPage() {
  const [linhas, setLinhas] = useState<LinhaOcupacao[]>([]);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleArquivo(file: File | undefined) {
    if (!file) return;
    setErro('');
    setMensagem('');
    setNomeArquivo(file.name);
    try {
      const texto = (await file.text()).replace(/^\uFEFF/, '');
      const primeiraLinha = texto.split(/\r?\n/)[0] || '';
      const sep = primeiraLinha.includes(';') ? ';' : ',';
      const tabela = parseCSV(texto, sep);
      if (tabela.length < 2) { setErro('CSV vazio ou sem linhas de dados.'); setLinhas([]); return; }

      const header = tabela[0].map((h) => h.trim().toLowerCase());
      const idx = {
        user: header.findIndex((h) => h === 'user_id'),
        sup: header.findIndex((h) => h === 'supervisor'),
        tl: header.findIndex((h) => h === 'team leader'),
        rep: header.findIndex((h) => h === 'rep'),
        totes: header.findIndex((h) => h === 'qtd totes'),
        ocup: header.findIndex((h) => h.startsWith('ocupação') || h.startsWith('ocupacao')),
      };
      const faltando = Object.entries(idx).filter(([, v]) => v === -1).map(([k]) => k);
      if (faltando.length > 0) {
        setErro('Colunas não encontradas no CSV: ' + faltando.join(', ') + '. Confere o cabeçalho.');
        setLinhas([]);
        return;
      }

      const dados: LinhaOcupacao[] = [];
      for (let i = 1; i < tabela.length; i++) {
        const c = tabela[i];
        const userId = (c[idx.user] || '').trim();
        const pct = converterPct(c[idx.ocup] || '');
        if (!userId || pct === null) continue;
        dados.push({
          user_id: userId,
          supervisor: (c[idx.sup] || '').trim(),
          team_leader: (c[idx.tl] || '').trim(),
          rep: (c[idx.rep] || '').trim(),
          qtd_totes: Number(c[idx.totes]) || 0,
          ocupacao_pct: pct,
        });
      }
      if (dados.length === 0) { setErro('Nenhuma linha válida encontrada.'); setLinhas([]); return; }
      setLinhas(dados);
    } catch (e: any) {
      setErro('Erro lendo o arquivo: ' + (e.message || String(e)));
      setLinhas([]);
    }
  }

  async function salvar() {
    if (linhas.length === 0) return;
    setSalvando(true);
    setErro('');
    setMensagem('');
    try {
      // sem data: apaga tudo e grava o CSV novo (substitui o upload anterior)
      const { error: errDel } = await supabase.from('ocupacao').delete().neq('id', 0);
      if (errDel) throw new Error('apagar anterior: ' + errDel.message);

      const TAM = 500;
      for (let i = 0; i < linhas.length; i += TAM) {
        const lote = linhas.slice(i, i + TAM);
        const { error: errIns } = await supabase.from('ocupacao').insert(lote);
        if (errIns) throw new Error('inserir lote ' + (i / TAM + 1) + ': ' + errIns.message);
      }
      setMensagem(`✅ ${linhas.length} colaboradores de ocupação salvos. Upload anterior substituído.`);
      setLinhas([]);
      setNomeArquivo('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e: any) {
      setErro('Erro ao salvar: ' + (e.message || String(e)));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div>
          <Link href="/meu-time" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            ← Voltar ao Meu Time
          </Link>
          <h1 className="text-3xl font-black mt-2">
            Upload de <span className="text-[#FFD700]">Ocupação</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Sobe o CSV de ocupação. Cada upload substitui o anterior (sem data).
          </p>
        </div>

        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-[#2a2a2a] hover:border-[#FFD700]/50 rounded-xl p-8 text-center cursor-pointer bg-[#1a1a1a] transition-all"
        >
          <div className="text-4xl mb-2">📄</div>
          <p className="text-sm font-bold">Clica pra escolher o CSV de ocupação</p>
          {nomeArquivo && <p className="text-xs text-gray-500 mt-2">Arquivo: {nomeArquivo}</p>}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(e) => handleArquivo(e.target.files?.[0])}
          />
        </div>

        {erro && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">❌ {erro}</div>
        )}
        {mensagem && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-sm text-green-300">{mensagem}</div>
        )}

        {linhas.length > 0 && (
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <p className="text-sm text-gray-300">
                <strong className="text-[#FFD700]">{linhas.length}</strong> colaboradores lidos. Confere a prévia:
              </p>
              <button
                onClick={salvar}
                disabled={salvando}
                className="bg-[#FFD700] hover:bg-yellow-400 text-black font-black py-2 px-5 rounded-lg disabled:opacity-40"
              >
                {salvando ? 'Salvando...' : '💾 Salvar (substitui o anterior)'}
              </button>
            </div>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="text-gray-400 border-b border-[#2a2a2a] sticky top-0 bg-[#1a1a1a]">
                  <tr>
                    <th className="text-left py-2 px-2">ID</th>
                    <th className="text-left py-2 px-2">Rep</th>
                    <th className="text-right py-2 px-2">Totes</th>
                    <th className="text-right py-2 px-2">Ocupação</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, i) => (
                    <tr key={i} className="border-b border-[#2a2a2a]">
                      <td className="py-1.5 px-2 font-mono">{l.user_id}</td>
                      <td className="py-1.5 px-2">{l.rep}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{l.qtd_totes}</td>
                      <td className="py-1.5 px-2 text-right font-mono text-emerald-300">{l.ocupacao_pct.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
