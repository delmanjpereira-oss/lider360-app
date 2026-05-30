// app/api/ia/gerar-emoji/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const { nome, url } = await req.json();
    
    if (!nome || nome.trim().length === 0) {
      return NextResponse.json({ emoji: '🔗' });
    }
    
    const prompt = `Você é um gerador de emojis. Dado um nome de site/serviço e a URL, retorne APENAS UM emoji que melhor representa o site. Sem texto, sem explicação, APENAS o emoji.

Exemplos:
- "Mercado Livre" → 🛒
- "GitHub" → 🐙
- "Gmail" → 📧
- "Dashboard de Vendas" → 📊
- "Calendário Google" → 📅
- "Drive" → 📁
- "WhatsApp" → 💬
- "YouTube" → ▶️
- "Notion" → 📓
- "Slack" → 💬
- "Boletim de Notas" → 📋
- "Site de Logística" → 🚚
- "Painel Financeiro" → 💰
- "Time RH" → 👥
- "Mapa de Operação" → 🗺️

Nome: ${nome.trim()}
URL: ${url || 'não informada'}

Responda APENAS com 1 emoji. Nada mais.`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: prompt }],
    });
    
    let emoji = '🔗';
    if (message.content[0].type === 'text') {
      const texto = message.content[0].text.trim();
      // Pega o primeiro caracter (que deve ser o emoji)
      // Usa Array.from pra lidar com emojis compostos (UTF-16)
      const chars = Array.from(texto);
      if (chars.length > 0) emoji = chars[0];
    }
    
    return NextResponse.json({ emoji });
  } catch (error: any) {
    console.error('Erro ao gerar emoji:', error);
    return NextResponse.json({ emoji: '🔗', erro: error.message });
  }
}
