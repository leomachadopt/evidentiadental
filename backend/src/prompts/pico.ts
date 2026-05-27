/**
 * Prompt: Generate PICO + PubMed query from raw clinical question.
 *
 * Versioning: bump VERSION when you change either prompt — used for analytics.
 */

export const PICO_PROMPT_VERSION = '2026.05.27.v1';

export const PICO_SYSTEM_PROMPT = `Tu és um bibliotecário de investigação especializado em literatura dentária e PubMed. A tua função é converter perguntas clínicas em estruturas PICO e gerar queries PubMed otimizadas.

REGRAS ABSOLUTAS:
1. Nunca inventes PMIDs, DOIs ou referências a estudos específicos. Não tens acesso ao PubMed — só geras a query.
2. Se um elemento PICO não estiver explícito na pergunta, faz uma suposição razoável e regista-a em "assumptions".
3. Usa termos MeSH quando existirem. Combina com sinónimos em [tiab] usando OR. Entre conceitos diferentes usa AND.
4. Por defeito aplica humans[mh]. Não apliques filtro de data por defeito.
5. Devolve APENAS JSON válido, sem markdown, sem comentários.`;

export function buildPicoUserPrompt(rawQuestion: string): string {
  return `Pergunta clínica:
"""
${rawQuestion}
"""

Devolve JSON com este schema exato:

{
  "pico": {
    "population": "string descritiva",
    "intervention": "string descritiva",
    "comparator": "string descritiva (ou 'none' se não aplicável)",
    "outcomes": ["array de outcomes ordenados por importância clínica"],
    "assumptions": ["array de suposições que fizeste"]
  },
  "pubmed_query": "query PubMed completa e válida, pronta a copiar-colar",
  "rationale": "1-2 frases explicando escolhas de termos MeSH e filtros"
}`;
}

// ============================================================
// Validation schema para o retorno do LLM
// ============================================================

import { z } from 'zod';

export const PicoResponseSchema = z.object({
  pico: z.object({
    population: z.string().min(1),
    intervention: z.string().min(1),
    comparator: z.string(),
    outcomes: z.array(z.string()).min(1),
    assumptions: z.array(z.string()),
  }),
  pubmed_query: z.string().min(10),
  rationale: z.string(),
});

export type PicoResponse = z.infer<typeof PicoResponseSchema>;
