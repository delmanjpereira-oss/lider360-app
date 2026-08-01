import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

/**
 * 🎯 KEEP-ALIVE do Supabase Free Tier
 * 
 * Rodado automaticamente pelo Vercel Cron TODO DIA às 03:00 UTC (00:00 BR)
 * Faz 1 query simples pra resetar o timer de inatividade de 7 dias
 * 
 * Sem isso: Supabase pausa após 7 dias sem uso
 * Com isso: Roda diário → NUNCA pausa
 */
export async function GET() {
  const inicio = Date.now();
  const agora = new Date();
  
  try {
    // 1️⃣ Query LEVE (só conta linhas, não baixa dados)
    const { count, error } = await supabase
      .from('colaboradores')
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.error('❌ Keep-alive falhou:', error);
      return NextResponse.json({
        status: 'error',
        message: 'Falha ao contatar Supabase',
        error: error.message,
        timestamp: agora.toISOString(),
      }, { status: 500 });
    }
    
    const tempoMs = Date.now() - inicio;
    
    console.log(`✅ Keep-alive OK — ${count} colaboradores — ${tempoMs}ms`);
    
    // 2️⃣ Registra o ping no log (opcional)
    try {
      await supabase.from('keep_alive_log').insert({
        pinged_at: agora.toISOString(),
        response_ms: tempoMs,
        rows_counted: count || 0,
      });
    } catch {
      // Se tabela não existe, ignora (não é crítico)
    }
    
    return NextResponse.json({
      status: 'alive',
      timestamp: agora.toISOString(),
      supabase: {
        connected: true,
        response_ms: tempoMs,
        colaboradores_count: count,
      },
      message: '🎯 LIDER 360 tá vivo! Supabase respondeu.',
    });
    
  } catch (e: any) {
    console.error('❌ Erro fatal keep-alive:', e);
    return NextResponse.json({
      status: 'error',
      message: e.message,
      timestamp: agora.toISOString(),
    }, { status: 500 });
  }
}

// Também aceita POST (pra testes manuais)
export async function POST() {
  return GET();
}
