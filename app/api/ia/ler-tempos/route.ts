// app/api/ia/ler-tempos/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const MODELO = 'claude-haiku-4-5-20251001';

export async function POST(req: NextRequest) {
  try {
    const { imagemBase64, mediaType } = await req.json();
    
    if (!imagemBase64) {
      return NextResponse.json({ erro: 'Imagem não enviada' }, { status: 400 });
    }
    
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ erro: 'API key não configurada' }, { status: 500 });
    }
    
    const systemPrompt = `Você é um especialista em ler imagens de relatórios de tempo do sistema MELI.

A imagem mostra 4 categorias de tempo, geralmente no formato "Xh Ymin" ou "Y min":
1. "Ociosidade Total" (ou "Ociosidade")
2. "Tempo Efetivo" (ou "Efetivo")
3. "Tempo não sistêmico" (ou "Não sistêmico" / "Não medido")
4. "Tempo não disponível" (ou "Não disponível")

REGRAS CRÍTICAS:
- Retorne APENAS um JSON válido, sem markdown, sem explicação, sem texto antes/depois
- Cada categoria deve ter "h" (horas) e "m" (minutos)
- Se uma categoria tiver só minutos (ex: "45 min"), use h=0, m=45
- Se uma categoria tiver só horas (ex: "2h"), use h=2, m=0
- Se NÃO encontrar uma categoria na imagem, use h=0, m=0
- Os valores devem ser INTEIROS (não use decimal)

FORMATO EXATO DA RESPOSTA:
{"ociosidade":{"h":0,"m":0},"efetivo":{"h":0,"m":0},"naoSistemico":{"h":0,"m":0},"naoDisponivel":{"h":0,"m":0}}`;

    const response = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 300,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/png',
                data: imagemBase64,
              },
            },
            {
              type: 'text',
              text: 'Leia os 4 tempos da imagem e retorne o JSON exato.',
            },
          ],
        }],
      }),
    });
    
    if (!response.ok) {
      const txt = await response.text();
      console.error('Anthropic erro:', response.status, txt.slice(0, 500));
      return NextResponse.json({ erro: 'Erro na IA: ' + response.status }, { status: 500 });
    }
    
    const data = await response.json();
    
    let texto = '';
    if (Array.isArray(data?.content) && data.content[0]?.type === 'text') {
      texto = String(data.content[0].text || '').trim();
    }
    
    console.log('🤖 Resposta IA:', texto);
    
    // Parse do JSON da IA
    let tempos = null;
    try {
      // Remove markdown se vier
      const limpo = texto.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      tempos = JSON.parse(limpo);
    } catch (e) {
      // Tenta extrair JSON do meio do texto
      const match = texto.match(/\{[\s\S]*\}/);
      if (match) {
        try { tempos = JSON.parse(match[0]); } catch {}
      }
    }
    
    if (!tempos || typeof tempos !== 'object') {
      return NextResponse.json({ erro: 'IA não retornou JSON válido', textoBruto: texto }, { status: 500 });
    }
    
    // Garante estrutura completa (zera o que faltou)
    const final = {
      ociosidade: { h: Number(tempos?.ociosidade?.h) || 0, m: Number(tempos?.ociosidade?.m) || 0 },
      efetivo: { h: Number(tempos?.efetivo?.h) || 0, m: Number(tempos?.efetivo?.m) || 0 },
      naoSistemico: { h: Number(tempos?.naoSistemico?.h) || 0, m: Number(tempos?.naoSistemico?.m) || 0 },
      naoDisponivel: { h: Number(tempos?.naoDisponivel?.h) || 0, m: Number(tempos?.naoDisponivel?.m) || 0 },
    };
    
    return NextResponse.json({ tempos: final });
  } catch (error: any) {
    console.error('Erro ler tempos:', error?.message || error);
    return NextResponse.json({ erro: error?.message || 'Erro desconhecido' }, { status: 500 });
  }
}
