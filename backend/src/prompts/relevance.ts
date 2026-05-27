/**
 * Prompt: Score relevance of retrieved papers against the original question.
 *
 * Input: PICO + paper abstracts (in batches of ~10)
 * Output: per-paper score 0-100 + 1-sentence reasoning
 */

export const RELEVANCE_PROMPT_VERSION = '2026.05.27.v1';

export const RELEVANCE_SYSTEM_PROMPT = `Tu és um clínico dentário sénior a avaliar a relevância de papers para uma pergunta clínica específica.

Recebes uma pergunta clínica + PICO + abstracts de vários papers. Para cada paper, devolves:
- Um score de relevância de 0 a 100
- 1 frase justificando o score

CRITÉRIOS DE SCORE:
- 90-100: aborda EXATAMENTE a pergunta (mesma população, mesma intervenção, mesmo outcome)
- 70-89: aborda a pergunta com desvios menores (e.g. população ligeiramente diferente)
- 50-69: relevante mas tangencial (e.g. mesma intervenção, outcome diferente)
- 30-49: relacionado mas não responde diretamente
- 0-29: pouco ou nada relevante

REGRAS:
- Privilegia desenhos de estudo robustos (SR/MA > RCT > coorte > caso-controlo > série de casos) quando o resto for igual.
- Penaliza estudos in vitro, em animais, ou case reports a menos que a pergunta o peça.
- Devolve APENAS JSON válido.`;

export function buildRelevanceUserPrompt(
  rawQuestion: string,
  picoSummary: string,
  papers: Array<{ pmid: string; title: string; abstract: string | null; publicationTypes: string[]; year: number | null }>,
): string {
  const paperBlocks = papers
    .map(
      (p, i) =>
        `## Paper ${i + 1}
PMID: ${p.pmid}
Year: ${p.year ?? 'unknown'}
Types: ${p.publicationTypes.join(', ') || 'unknown'}
Title: ${p.title}
Abstract: ${p.abstract?.slice(0, 1500) ?? '(no abstract available)'}`,
    )
    .join('\n\n---\n\n');

  return `Pergunta clínica: "${rawQuestion}"

PICO resumido: ${picoSummary}

Avalia a relevância destes papers:

${paperBlocks}

Devolve JSON com este schema:

{
  "scores": [
    { "pmid": "PMID exato como acima", "score": 0-100, "reasoning": "1 frase" }
  ]
}

A ordem do array deve corresponder à ordem dos papers acima. Inclui TODOS os papers.`;
}

import { z } from 'zod';

export const RelevanceResponseSchema = z.object({
  scores: z.array(
    z.object({
      pmid: z.string(),
      score: z.number().int().min(0).max(100),
      reasoning: z.string(),
    }),
  ),
});

export type RelevanceResponse = z.infer<typeof RelevanceResponseSchema>;
