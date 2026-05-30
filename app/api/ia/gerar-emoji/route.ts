// app/api/ia/gerar-emoji/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const MODELO = 'claude-haiku-4-5-20251001';

export async function POST(req: NextRequest) {
  try {
    const { nome, url } = await req.json();
    
    if (!nome || nome.trim().length === 0) {
      return NextResponse.json({ emoji: '🔗' });
    }
    
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY não configurada');
      return NextResponse.json({ emoji: '🔗' });
    }
    
    const systemPrompt = 'Você é um gerador de emojis. Dado um nome de site/serviço e a URL, retorne APENAS UM emoji que melhor representa o site. Sem texto, sem explicação, APENAS o emoji.\n\nExemplos:\n- "Mercado Livre" -> 🛒\n- "GitHub" -> 🐙\n- "Gmail" -> 📧\n- "Dashboard de Vendas" -> 📊\n- "Calendário Google" -> 📅\n- "Drive" -> 📁\n- "WhatsApp" -> 💬\n- "YouTube" -> ▶️\n- "Notion" -> 📓\n- "Slack" -> 💬\n- "Boletim de Notas" -> 📋\n- "Site de Logística" -> 🚚\n- "Painel Financeiro" -> 💰\n- "Time RH" -> 👥\n- "Mapa de Operação" -> 🗺️\n- "Discord" -> 🎮\n- "Twitter X" -> 🐦\n- "Spotify" -> 🎵\n- "Linkedin" -> 💼\n\nResponda APENAS com 1 emoji. Nada mais.';
    
    const userMessage = 'Nome: ' + nome.trim() + '\nURL: ' + (url || 'não informada');
    
    const response = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 10,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userMessage },
        ],
      }),
    });
    
    if (!response.ok) {
      const txt = await response.text();
      console.error('Anthropic erro:', response.status, txt.slice(0, 200));
      return NextResponse.json({ emoji: '🔗' });
    }
    
    const data = await response.json();
    
    let texto = '';
    if (Array.isArray(data?.content) && data.content[0]?.type === 'text') {
      texto = String(data.content[0].text || '').trim();
    }
    
    // Pega o primeiro caractere visual (emoji)
    const chars = Array.from(texto);
    const emoji = chars.length > 0 ? chars[0] : '🔗';
    
    return NextResponse.json({ emoji });
  } catch (error: any) {
    console.error('Erro ao gerar emoji:', error?.message || error);
    return NextResponse.json({ emoji: '🔗' });
  }
}
