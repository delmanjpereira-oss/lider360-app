import { NextRequest, NextResponse } from 'next/server';

// ============================================
// API: LER DPMO DO PRINT (Claude Vision)
// /app/api/ia/ler-dpmo/route.ts
// ============================================

export const runtime = 'nodejs';
export const maxDuration = 60;

type ImagemInput = {
  base64: string; // data:image/png;base64,XXX ou só o base64
  mimeType?: string; // image/png, image/jpeg
};

type ColabExtraido = {
  nome: string;
  semanas: Record<string, number | null>;
  total_geral: number | null;
};

type RespostaIA = {
  semanas: number[];
  colaboradores: ColabExtraido[];
  erro?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const imagens: ImagemInput[] = body.imagens || [];
    const mes: number = body.mes || 0;
    const ano: number = body.ano || 0;
    const processo: string = body.processo || 'Checkin'; // "Checkin" ou "P2M"

    if (imagens.length === 0) {
      return NextResponse.json(
        { erro: 'Nenhuma imagem enviada' },
        { status: 400 }
      );
    }

    if (imagens.length > 3) {
      return NextResponse.json(
        { erro: 'Máximo 3 imagens por chamada' },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { erro: 'ANTHROPIC_API_KEY não configurada' },
        { status: 500 }
      );
    }

    // ============================================
    // Monta o prompt específico do DPMO/Looker
    // ============================================
    const prompt = buildPrompt(mes, ano, processo);

    // ============================================
    // Monta o content array com prompt + imagens
    // ============================================
    const content: any[] = [];

    // Adiciona cada imagem
    imagens.forEach((img, i) => {
      // Limpa o base64 (remove prefixo data:...)
      let base64Limpo = img.base64;
      let mimeType = img.mimeType || 'image/png';

      if (base64Limpo.startsWith('data:')) {
        const match = base64Limpo.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          base64Limpo = match[2];
        }
      }

      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mimeType,
          data: base64Limpo,
        },
      });

      // Adiciona um marcador se tem mais de 1 imagem
      if (imagens.length > 1) {
        content.push({
          type: 'text',
          text: `↑ Imagem ${i + 1} de ${imagens.length}`,
        });
      }
    });

    // Adiciona o prompt final
    content.push({
      type: 'text',
      text: prompt,
    });

    // ============================================
    // Chama a API do Claude
    // ============================================
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content,
          },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('❌ Erro API Anthropic:', errText);
      return NextResponse.json(
        { erro: `Anthropic API erro ${resp.status}: ${errText}` },
        { status: 500 }
      );
    }

    const data = await resp.json();
    const textoResposta = data.content?.[0]?.text || '';

    console.log('🤖 Resposta bruta da IA:', textoResposta);

    // ============================================
    // Parseia o JSON da resposta
    // ============================================
    const jsonExtraido = extrairJson(textoResposta);

    if (!jsonExtraido) {
      return NextResponse.json(
        {
          erro: 'IA não retornou JSON válido',
          respostaBruta: textoResposta,
        },
        { status: 500 }
      );
    }

    // Valida estrutura básica
    if (!jsonExtraido.colaboradores || !Array.isArray(jsonExtraido.colaboradores)) {
      return NextResponse.json(
        {
          erro: 'JSON sem colaboradores',
          respostaBruta: textoResposta,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      sucesso: true,
      semanas: jsonExtraido.semanas || [],
      colaboradores: jsonExtraido.colaboradores || [],
      total: jsonExtraido.colaboradores.length,
      tokens: {
        input: data.usage?.input_tokens || 0,
        output: data.usage?.output_tokens || 0,
      },
    });
  } catch (e: any) {
    console.error('❌ Erro geral:', e);
    return NextResponse.json(
      { erro: e.message || 'Erro desconhecido' },
      { status: 500 }
    );
  }
}

// ============================================
// HELPERS
// ============================================

function buildPrompt(mes: number, ano: number, processo: string): string {
  const nomesMeses = [
    '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];
  const mesLabel = nomesMeses[mes] || '';

  return `Você é um extrator especializado no relatório DPMO do Looker MELI (Mercado Livre).

Analise o(s) print(s) acima e extraia os dados dos colaboradores em formato JSON.

**CONTEXTO:**
- Processo: ${processo}
- Mês/Ano de referência: ${mesLabel} de ${ano}
- Formato típico: Tabela com nomes na esquerda, valores DPMO por semana e "Total Geral" na última coluna

**ESTRUTURA DE RESPOSTA (JSON puro, sem markdown):**
{
  "semanas": [22, 21, 20, 19, 18],
  "colaboradores": [
    {
      "nome": "Ana Silva Souza",
      "semanas": {
        "22": 1234,
        "21": 856,
        "20": null,
        "19": 1580,
        "18": 720
      },
      "total_geral": 4390
    }
  ]
}

**REGRAS OBRIGATÓRIAS:**

1. **Semanas:** 
   - Extraia os números das semanas do cabeçalho (ex: "Semana 22", "Sem 21", etc)
   - MANTENHA A ORDEM que aparecem no print (Looker exibe da MAIS RECENTE pra MAIS ANTIGA)
   - Se não tem cabeçalho claro, deduza pela quantidade de colunas de valores

2. **Nomes:**
   - Extraia EXATAMENTE como aparece (não abrevie, não invente)
   - Se aparece "Ana S." use "Ana S." (não expanda)
   - Se aparece nome completo "Ana Silva Souza" use como está
   - Ignore linhas de cabeçalho (ex: "Nome", "Representante", "COMPLETO")

3. **Valores DPMO:**
   - São números inteiros (ex: 1234, 856, 4390)
   - Ponto ou vírgula = separador de milhar (ex: "10.014" = 10014)
   - Traço "-" ou "—" = valor vazio → use \`null\` no JSON
   - "0" literal = zero → use 0 no JSON (não null)
   - Ordem: os valores das semanas seguem a MESMA ORDEM do cabeçalho

4. **Total Geral:**
   - É SEMPRE a ÚLTIMA coluna da linha do colab
   - É a soma dos valores das semanas (mas confie no que aparece no print)

5. **NUNCA:**
   - Não invente valores que não estão visíveis
   - Não junte 2 linhas em 1 colab
   - Não corte nomes
   - Não use markdown, não use \`\`\`json, retorne SÓ o JSON puro

6. **Se múltiplos prints:**
   - Cada print pode ter colabs diferentes OU os mesmos colabs (dependendo do scroll do Looker)
   - Combine em uma única lista (mesmo colab que aparece em 2 prints = 1 entrada no JSON, complementando semanas)

**RESPOSTA:**
Retorne APENAS o JSON puro, começando com { e terminando com }. Nenhum texto antes ou depois.`;
}

function extrairJson(texto: string): RespostaIA | null {
  if (!texto) return null;

  // Remove markdown de código se houver
  let limpo = texto
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Tenta parse direto
  try {
    return JSON.parse(limpo);
  } catch {}

  // Tenta achar o { ... } no meio do texto
  const match = limpo.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch (e) {
      console.error('❌ Erro parseando JSON extraído:', e);
    }
  }

  return null;
}
