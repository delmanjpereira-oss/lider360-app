// ============================================
// 🧠 API: Finalizar Tarefa com Aprendizado
// ============================================
// Quando TL finaliza uma tarefa, capturamos:
// - O que ele fez (ação tomada)
// - Como foi (resultado)
// - Observação dele
// - Snapshot da performance ATUAL (pra comparar depois)
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      id_tarefa,
      resultado_efetivo,   // 'sucesso' | 'neutro' | 'falha' | 'pendente'
      acao_tomada,          // 'feedback_dado' | 'observacao_apenas' | 'ignorado' | 'reagendado'
      observacao_tl,        // texto livre
    } = body;
    
    if (!id_tarefa) {
      return NextResponse.json({ erro: 'id_tarefa obrigatório' }, { status: 400 });
    }
    
    // 1️⃣ Busca a tarefa
    const { data: tarefa, error: errBusca } = await supabase
      .from('tarefas')
      .select('*')
      .eq('id_tarefa', id_tarefa)
      .single();
    
    if (errBusca || !tarefa) {
      return NextResponse.json({ erro: 'Tarefa não encontrada' }, { status: 404 });
    }
    
    // 2️⃣ Captura snapshot da performance ATUAL
    const dias30atras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const { data: historicoAtual } = await supabase
      .from('historico')
      .select('liquida, data_referencia')
      .eq('id_groot', tarefa.id_groot)
      .gte('data_referencia', dias30atras);
    
    const liquidasAtual = (historicoAtual || []).map(h => Number(h.liquida) || 0).filter(v => v > 0);
    const mediaAtual = liquidasAtual.length > 0 
      ? liquidasAtual.reduce((s, v) => s + v, 0) / liquidasAtual.length 
      : 0;
    
    const performanceAntes = {
      liquida_media_30d: Math.round(mediaAtual),
      dias_com_dado: liquidasAtual.length,
      data_snapshot: new Date().toISOString(),
    };
    
    // 3️⃣ Classifica o aprendizado baseado no que TL falou
    let classificacao = 'pendente_avaliacao';
    if (resultado_efetivo === 'sucesso' && acao_tomada === 'feedback_dado') {
      classificacao = 'abordagem_funcionou';
    } else if (resultado_efetivo === 'falha' && acao_tomada === 'feedback_dado') {
      classificacao = 'abordagem_falhou';
    } else if (acao_tomada === 'ignorado') {
      classificacao = 'tl_decidiu_nao_agir';
    } else if (acao_tomada === 'reagendado') {
      classificacao = 'momento_inadequado';
    }
    
    // 4️⃣ Atualiza a tarefa
    const { error: errUpdate } = await supabase
      .from('tarefas')
      .update({
        status: 'Finalizada',
        resultado_efetivo: resultado_efetivo || 'pendente',
        acao_tomada: acao_tomada || 'observacao_apenas',
        observacao_tl: observacao_tl || null,
        performance_antes: performanceAntes,
        classificacao_aprendizado: classificacao,
        finalizada_em: new Date().toISOString(),
      })
      .eq('id_tarefa', id_tarefa);
    
    if (errUpdate) {
      return NextResponse.json({ erro: errUpdate.message }, { status: 500 });
    }
    
    return NextResponse.json({ 
      sucesso: true,
      mensagem: 'Tarefa finalizada! A IA vai aprender com esse resultado.',
      performance_capturada: performanceAntes,
      classificacao,
    });
    
  } catch (e: any) {
    console.error('❌ Erro:', e);
    return NextResponse.json({ erro: e.message }, { status: 500 });
  }
}

// ============================================
// PATCH: Recalcula performance 7d/30d depois
// (chamado por cron job ou manualmente)
// ============================================
export async function PATCH(req: NextRequest) {
  try {
    // Busca tarefas finalizadas com performance_depois ainda nula
    const dias7atras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dias30atras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: tarefasParaAtualizar } = await supabase
      .from('tarefas')
      .select('*')
      .eq('status', 'Finalizada')
      .not('finalizada_em', 'is', null);
    
    let atualizadas = 0;
    
    for (const tarefa of tarefasParaAtualizar || []) {
      const dataFinalizacao = new Date(tarefa.finalizada_em);
      const diasDesdeFinalizacao = Math.floor(
        (Date.now() - dataFinalizacao.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      const dataInicio = dataFinalizacao.toISOString().split('T')[0];
      
      // 7 DIAS DEPOIS
      if (diasDesdeFinalizacao >= 7 && !tarefa.performance_depois_7d) {
        const data7dDepois = new Date(dataFinalizacao.getTime() + 7 * 24 * 60 * 60 * 1000)
          .toISOString().split('T')[0];
        
        const { data: hist7d } = await supabase
          .from('historico')
          .select('liquida')
          .eq('id_groot', tarefa.id_groot)
          .gte('data_referencia', dataInicio)
          .lte('data_referencia', data7dDepois);
        
        const liquidas7d = (hist7d || []).map(h => Number(h.liquida) || 0).filter(v => v > 0);
        const media7d = liquidas7d.length > 0 
          ? liquidas7d.reduce((s, v) => s + v, 0) / liquidas7d.length 
          : 0;
        
        const perfAntes = tarefa.performance_antes?.liquida_media_30d || 0;
        const variacao7d = perfAntes > 0 ? ((media7d - perfAntes) / perfAntes) * 100 : 0;
        
        await supabase
          .from('tarefas')
          .update({
            performance_depois_7d: {
              liquida_media: Math.round(media7d),
              dias_com_dado: liquidas7d.length,
              variacao_pct: Number(variacao7d.toFixed(1)),
            },
          })
          .eq('id_tarefa', tarefa.id_tarefa);
        
        atualizadas++;
      }
      
      // 30 DIAS DEPOIS
      if (diasDesdeFinalizacao >= 30 && !tarefa.performance_depois_30d) {
        const data30dDepois = new Date(dataFinalizacao.getTime() + 30 * 24 * 60 * 60 * 1000)
          .toISOString().split('T')[0];
        
        const { data: hist30d } = await supabase
          .from('historico')
          .select('liquida')
          .eq('id_groot', tarefa.id_groot)
          .gte('data_referencia', dataInicio)
          .lte('data_referencia', data30dDepois);
        
        const liquidas30d = (hist30d || []).map(h => Number(h.liquida) || 0).filter(v => v > 0);
        const media30d = liquidas30d.length > 0 
          ? liquidas30d.reduce((s, v) => s + v, 0) / liquidas30d.length 
          : 0;
        
        const perfAntes = tarefa.performance_antes?.liquida_media_30d || 0;
        const variacao30d = perfAntes > 0 ? ((media30d - perfAntes) / perfAntes) * 100 : 0;
        
        // 🎯 RECLASSIFICA aprendizado baseado em resultado real
        let novaClassificacao = tarefa.classificacao_aprendizado;
        if (variacao30d > 5) {
          novaClassificacao = 'sucesso_confirmado';
        } else if (variacao30d < -5) {
          novaClassificacao = 'falha_confirmada';
        } else {
          novaClassificacao = 'efeito_neutro';
        }
        
        await supabase
          .from('tarefas')
          .update({
            performance_depois_30d: {
              liquida_media: Math.round(media30d),
              dias_com_dado: liquidas30d.length,
              variacao_pct: Number(variacao30d.toFixed(1)),
            },
            classificacao_aprendizado: novaClassificacao,
          })
          .eq('id_tarefa', tarefa.id_tarefa);
        
        atualizadas++;
      }
    }
    
    return NextResponse.json({ 
      sucesso: true, 
      atualizadas,
      mensagem: 'Performance pós-tarefa recalculada' 
    });
    
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 });
  }
}
