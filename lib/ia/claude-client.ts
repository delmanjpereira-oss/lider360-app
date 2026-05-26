// ============================================
// 🤖 CLAUDE CLIENT - LIDER 360
// ============================================
// Cliente reutilizável pra chamar Claude da Anthropic
// Usado por todas as APIs de IA do app
// ============================================

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Modelo padrão: Claude Sonnet 4.5 (top de linha)
const MODELO_PADRAO = 'claude-sonnet-4-5';

export type ClaudeMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type ChamarClaudeOptions = {
  modelo?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  responseJson?: boolean;
};

/**
 * Chama o Claude da Anthropic.
 * 
 * @param messages - Array de mensagens (user/assistant)
 * @param options - Configurações opcionais
 * @returns Texto da resposta
 */
export async function chamarClaude(
  messages: ClaudeMessage[],
  options: ChamarClaudeOptions = {}
): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY não configurada');
  }
  
  const {
    modelo = MODELO_PADRAO,
    maxTokens = 4000,
    temperature = 0.3,
    systemPrompt,
    responseJson = false,
  } = options;
  
  const body: any = {
    model: modelo,
    max_tokens: maxTokens,
    temperature,
    messages,
  };
  
  if (systemPrompt) {
    body.system = systemPrompt;
  }
  
  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API erro:', response.status, errorText);
      throw new Error(`Claude API erro ${response.status}: ${errorText.slice(0, 200)}`);
    }
    
    const data = await response.json();
    const conteudo = data.content?.[0]?.text || '';
    
    return conteudo;
  } catch (e: any) {
    console.error('Erro chamando Claude:', e);
    throw e;
  }
}

/**
 * Chama Claude e parseia resposta como JSON.
 */
export async function chamarClaudeJson<T = any>(
  messages: ClaudeMessage[],
  options: ChamarClaudeOptions = {}
): Promise<T> {
  const texto = await chamarClaude(messages, options);
  
  // Tenta parsear o JSON
  try {
    return JSON.parse(texto);
  } catch (e) {
    // Tenta extrair JSON do meio do texto
    const matchArray = texto.match(/\[[\s\S]*\]/);
    const matchObject = texto.match(/\{[\s\S]*\}/);
    
    if (matchArray) {
      return JSON.parse(matchArray[0]);
    }
    if (matchObject) {
      return JSON.parse(matchObject[0]);
    }
    
    console.error('Falha ao parsear JSON da Claude. Resposta:', texto.slice(0, 500));
    throw new Error('Claude não retornou JSON válido');
  }
}
