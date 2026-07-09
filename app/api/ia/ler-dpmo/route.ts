import { NextRequest, NextResponse } from 'next/server';

// ============================================
// API: LER DPMO DO PRINT (Claude Vision) - V2
// /app/api/ia/ler-dpmo/route.ts
// 🆕 Prompt reforçado pra evitar erros de leitura
// ============================================

export const runtime = 'nodejs';
export const maxDuration = 60;

type ImagemInput = {
  base64: string;
  mimeType?: string;
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
    const processo: string = body.processo || 'Checkin';

    if (imagens.length === 0) {
      return NextResponse.json({ erro: 'Nenhuma imagem enviada' }, { status: 400 });
    }
    if (imagens.length > 3) {
      return NextResponse.json({ erro: 'Máximo 3 imagens por chamada' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ erro: 'ANTHROPIC_API_KEY não configurada' }, { status: 500 });
    }

    const prompt = buildPrompt(mes, ano, processo);
    const content: any[] = [];

    imagens.forEach((img, i) => {
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

      if (imagens.length > 1) {
        content.push({
          type: 'text',
          text: `↑ Imagem ${i + 1} de ${imagens.length}`,
        });
      }
    });

    content.push({
      type: 'text',
      text: prompt,
    });

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
        temperature: 0, // 🆕 Temperatura ZERO pra ser mais preciso e menos "criativo"
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

    const jsonExtraido = extrairJson(textoResposta);
    if (!jsonExtraido) {
      return NextResponse.json(
        { erro: 'IA não retornou JSON válido', respostaBruta: textoResposta },
        { status: 500 }
      );
    }

    if (!jsonExtraido.colaboradores || !Array.isArray(jsonExtraido.colaboradores)) {
      return NextResponse.json(
        { erro: 'JSON sem colaboradores', respostaBruta: textoResposta },
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
    return NextResponse.json({ erro: e.message || 'Erro desconhecido' }, { status: 500 });
  }
}

// ============================================
// PROMPT REFORÇADO
// ============================================
function buildPrompt(mes: number, ano: number, processo: string): string {
  const nomesMeses = [
    '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];
  const mesLabel = nomesMeses[mes] || '';

  return `Você é um extrator especializado no relatório DPMO do Looker MELI (Mercado Livre).

Analise o(s) print(s) e extraia os dados dos colaboradores em formato JSON.

**CONTEXTO:**
- Processo: ${processo}
- Mês/Ano de referência: ${mesLabel} de ${ano}
- Formato típico: Tabela com nomes à esquerda, valores DPMO por semana e "Total Geral" na última coluna

**⚠️ ATENÇÃO EXTRAORDINÁRIA À LEITURA DE NOMES:**

REGRAS OBRIGATÓRIAS PARA NOMES:
1. **Leia LETRA POR LETRA cuidadosamente** - Não presuma, não complete, não corrija ortografia
2. **Se ver 1 "s", escreva 1 "s"** - NÃO dobre letras que você não vê claramente
3. **Se ver 2 "s", escreva 2 "s"** - Preserve EXATAMENTE o que aparece
4. **NÃO "corrija" nomes** - Se ler "Barbosa", escreva "Barbosa" (não "Barbossa")
5. **NÃO adicione letras** - Só transcreva o que está VISIVELMENTE na imagem
6. **Preserve acentos** - Se ver "José", escreva "José" (não "Jose")
7. **Em caso de dúvida** - Escolha a grafia MAIS SIMPLES (menos letras)

EXEMPLOS DE ERROS COMUNS A EVITAR:
❌ Ler "Barbosa" (1 s) e escrever "Barbossa" (2 s)
❌ Ler "Silva" e escrever "Sylva"
❌ Ler "Souza" e escrever "Sousa"
❌ Ler "Kaique" e escrever "Caique"
✅ Ler EXATAMENTE o que está na imagem, mesmo se parecer estranho

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

**REGRAS DAS SEMANAS:**
- Extraia os números do cabeçalho (ex: "Semana 22", "Sem 21")
- MANTENHA A ORDEM que aparecem no print (mais recente → mais antiga)
- Se não tem cabeçalho, deduza pela quantidade de colunas

**REGRAS DOS VALORES:**
- São números inteiros (ex: 1234, 856, 4390)
- Ponto/vírgula = separador de milhar ("10.014" = 10014)
- Traço "-" ou "—" = null (valor vazio)
- "0" literal = 0 (não null)
- NUNCA invente valores

**REGRAS DO TOTAL GERAL:**
- SEMPRE a ÚLTIMA coluna
- Confie no que aparece no print

**SE MÚLTIPLOS PRINTS:**
- Combine em uma única lista
- Mesmo colab em prints diferentes → 1 entrada (complementa semanas)

**REGRA FINAL:**
Retorne APENAS o JSON puro, sem markdown, sem \`\`\`json, sem texto antes/depois.
Comece com { e termine com }.

**SE TIVER QUALQUER DÚVIDA NUM NOME → PREFIRA A GRAFIA MAIS SIMPLES/CURTA**`;
}

function extrairJson(texto: string): RespostaIA | null {
  if (!texto) return null;
  let limpo = texto.replace(/\`\`\`json\s*/gi, '').replace(/\`\`\`\s*/g, '').trim();

  try {
    return JSON.parse(limpo);
  } catch {}

  const match = limpo.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch (e) {
      console.error('❌ Erro parseando JSON:', e);
    }
  }
  return null;
}
