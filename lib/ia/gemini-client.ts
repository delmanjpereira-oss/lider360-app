/**
 * ====================================================
 * CLIENTE IA — GROQ (Llama 3.3 70B Versatile)
 * lib/ia/gemini-client.ts
 *
 * Arquivo mantém o nome "gemini-client" pra retrocompatibilidade,
 * mas por baixo agora usa a API do Groq (free tier muito mais amplo).
 *
 * Modelo: llama-3.3-70b-versatile (Meta, hospedado no Groq)
 * Free tier Groq: 30 req/min, 14.400 req/dia
 *
 * Endpoint compatível com formato OpenAI.
 * ====================================================
 */

export interface MensagemIA {
  role: 'user' | 'assistant';
  content: string;
}

interface IaOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  modelo?: string;
}

// Cascata de modelos do Groq (fallback automático)
const MODELOS_GROQ = [
  'llama-3.3-70b-versatile',  // melhor qualidade
  'llama-3.1-8b-instant',      // mais rápido (fallback)
  'gemma2-9b-it',              // último recurso
];

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Chama a IA com fallback automático entre modelos.
 * Mantém o nome `chamarGemini` pra retrocompatibilidade.
 */
export async function chamarGemini(
  mensagens: MensagemIA[],
  options: IaOptions = {}
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error(
      'GROQ_API_KEY não configurada nas Environment Variables do Vercel. Crie a chave em https://console.groq.com/keys'
    );
  }

  const modelosParaTentar = options.modelo ? [options.modelo] : MODELOS_GROQ;

  let ultimoErro: Error | null = null;

  for (const modelo of modelosParaTentar) {
    try {
      return await chamarGroqInterno(apiKey, modelo, mensagens, options);
    } catch (err: any) {
      ultimoErro = err;
      const msg = err?.message || '';
      // 429 = rate limit, 503 = serviço sobrecarregado → tenta próximo
      if (msg.includes('429') || msg.includes('503') || msg.toLowerCase().includes('rate')) {
        console.warn(`[Groq] ${modelo} sem quota/sobrecarregado, tentando próximo...`);
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    `Todos os modelos Groq indisponíveis. Último erro: ${ultimoErro?.message || 'desconhecido'}`
  );
}

/**
 * Chamada interna a um modelo Groq específico.
 */
async function chamarGroqInterno(
  apiKey: string,
  modelo: string,
  mensagens: MensagemIA[],
  options: IaOptions
): Promise<string> {
  // Formato OpenAI: system vai como mensagem com role='system'
  const messages: Array<{ role: string; content: string }> = [];

  if (options.systemPrompt) {
    messages.push({
      role: 'system',
      content: options.systemPrompt,
    });
  }

  for (const m of mensagens) {
    messages.push({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    });
  }

  const body = {
    model: modelo,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4096,
    top_p: 0.95,
    stream: false,
  };

  let response: Response;
  try {
    response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    throw new Error(`Falha de rede ao chamar Groq: ${err?.message || 'desconhecido'}`);
  }

  if (!response.ok) {
    let detalhe = `HTTP ${response.status}`;
    try {
      const txt = await response.text();
      detalhe += ` — ${txt.slice(0, 500)}`;
    } catch {
      // ignora
    }
    throw new Error(`Groq API erro: ${detalhe}`);
  }

  const data = await response.json();

  const texto = data?.choices?.[0]?.message?.content;

  if (!texto || typeof texto !== 'string') {
    console.error('[Groq] Resposta inesperada:', JSON.stringify(data).slice(0, 500));
    throw new Error('Resposta vazia ou inválida do Groq');
  }

  return texto.trim();
}

/**
 * Helper pra 1 prompt simples + system prompt.
 */
export async function gerarTextoComIA(
  prompt: string,
  systemPrompt: string,
  options: Omit<IaOptions, 'systemPrompt'> = {}
): Promise<string> {
  return chamarGemini(
    [{ role: 'user', content: prompt }],
    { ...options, systemPrompt }
  );
}
