/**
 * ====================================================
 * CLIENTE GEMINI (com fallback automático)
 * lib/ia/gemini-client.ts
 *
 * Tenta uma cascata de modelos. Se o primeiro der 429 (quota),
 * tenta o próximo automaticamente.
 *
 * Cascata: 1.5-flash → 1.5-flash-8b → 2.0-flash
 * (modelos legados costumam ter free tier mais aberto)
 * ====================================================
 */

export interface MensagemIA {
  role: 'user' | 'assistant';
  content: string;
}

interface GeminiOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  modelo?: string;
}

// Cascata de modelos pra tentar (ordem do mais permissivo pro menos)
const MODELOS_FALLBACK = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-2.0-flash',
];

/**
 * Chama a API do Gemini, com fallback automático entre modelos
 * se der 429 (quota excedida).
 */
export async function chamarGemini(
  mensagens: MensagemIA[],
  options: GeminiOptions = {}
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.gemini;

  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY (ou gemini) não configurada nas Environment Variables do Vercel'
    );
  }

  // Se o usuário passou um modelo específico, usa só ele
  // Senão, tenta a cascata
  const modelosParaTentar = options.modelo ? [options.modelo] : MODELOS_FALLBACK;

  let ultimoErro: Error | null = null;

  for (const modelo of modelosParaTentar) {
    try {
      return await chamarGeminiInterno(apiKey, modelo, mensagens, options);
    } catch (err: any) {
      ultimoErro = err;
      const msg = err?.message || '';
      // Se for erro 429 (quota), tenta próximo modelo
      if (msg.includes('429') || msg.toLowerCase().includes('quota')) {
        console.warn(`[Gemini] ${modelo} sem quota, tentando próximo...`);
        continue;
      }
      // Outros erros: aborta na hora
      throw err;
    }
  }

  // Se chegou aqui, todos os modelos falharam
  throw new Error(
    `Todos os modelos Gemini sem quota disponível. Último erro: ${
      ultimoErro?.message || 'desconhecido'
    }`
  );
}

/**
 * Chamada interna a um modelo específico.
 */
async function chamarGeminiInterno(
  apiKey: string,
  modelo: string,
  mensagens: MensagemIA[],
  options: GeminiOptions
): Promise<string> {
  const contents = mensagens.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body: any = {
    contents,
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxTokens ?? 8192,
      topP: 0.95,
      topK: 40,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };

  if (options.systemPrompt) {
    body.systemInstruction = {
      parts: [{ text: options.systemPrompt }],
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    throw new Error(`Falha de rede ao chamar Gemini: ${err?.message || 'desconhecido'}`);
  }

  if (!response.ok) {
    let detalhe = `HTTP ${response.status}`;
    try {
      const txt = await response.text();
      detalhe += ` — ${txt.slice(0, 500)}`;
    } catch {
      // ignora
    }
    throw new Error(`Gemini API erro: ${detalhe}`);
  }

  const data = await response.json();

  const candidato = data?.candidates?.[0];
  if (candidato?.finishReason === 'SAFETY') {
    throw new Error('Resposta bloqueada por filtros de segurança do Gemini');
  }

  const texto = candidato?.content?.parts?.[0]?.text;

  if (!texto || typeof texto !== 'string') {
    console.error('[Gemini] Resposta inesperada:', JSON.stringify(data).slice(0, 500));
    throw new Error('Resposta vazia ou inválida do Gemini');
  }

  return texto.trim();
}

/**
 * Helper pra 1 prompt simples + system prompt.
 */
export async function gerarTextoComIA(
  prompt: string,
  systemPrompt: string,
  options: Omit<GeminiOptions, 'systemPrompt'> = {}
): Promise<string> {
  return chamarGemini(
    [{ role: 'user', content: prompt }],
    { ...options, systemPrompt }
  );
}
