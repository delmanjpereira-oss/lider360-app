/**
 * ====================================================
 * CLIENTE GEMINI
 * Comunica com a API do Google Gemini (gratuita até 1500 req/dia)
 *
 * Suporta nome de env var: `gemini` ou `GEMINI_API_KEY`
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

/**
 * Chama a API do Gemini com uma conversa.
 *
 * @param mensagens - Array de mensagens da conversa
 * @param options - systemPrompt, temperature, maxTokens, modelo
 * @returns Texto gerado pela IA
 */
export async function chamarGemini(
  mensagens: MensagemIA[],
  options: GeminiOptions = {}
): Promise<string> {
  // Aceita ambos os nomes de env var (caso o usuário tenha colocado 'gemini' minúsculo)
  const apiKey = process.env.GEMINI_API_KEY || process.env.gemini;

  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY (ou gemini) não configurada nas Environment Variables do Vercel'
    );
  }

  const modelo = options.modelo || 'gemini-2.0-flash';

  // Gemini usa 'user' e 'model' (não 'assistant')
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
    // Safety settings — relaxar pra análise corporativa funcionar
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };

  // System prompt vai como systemInstruction (não como mensagem)
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

  // Verifica se foi bloqueado por safety
  const candidato = data?.candidates?.[0];
  if (candidato?.finishReason === 'SAFETY') {
    throw new Error('Resposta bloqueada por filtros de segurança do Gemini');
  }

  // Extrai texto
  const texto = candidato?.content?.parts?.[0]?.text;

  if (!texto || typeof texto !== 'string') {
    console.error('[Gemini] Resposta inesperada:', JSON.stringify(data).slice(0, 500));
    throw new Error('Resposta vazia ou inválida do Gemini');
  }

  return texto.trim();
}

/**
 * Helper pra chamar Gemini com 1 prompt simples + system prompt.
 * Wrapper conveniente pra casos onde não precisa de histórico de conversa.
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
