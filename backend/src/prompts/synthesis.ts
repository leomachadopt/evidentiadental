/**
 * Prompt: Generate clinical mini-synthesis from selected papers.
 *
 * ARCHITECTURAL GUARANTEE: this prompt forces the LLM to cite every factual
 * claim with [PMID xxxxx] inline. The backend then validates that every
 * cited PMID is in the allowed list. If validation fails, the call is
 * retried with the errors as feedback (max 3 attempts).
 */

export const SYNTHESIS_PROMPT_VERSION = '2026.05.27.v1';

export const SYNTHESIS_SYSTEM_PROMPT = `Tu és um clínico dentário sénior a sintetizar evidência científica para um colega que precisa de uma resposta rápida mas rigorosa.

REGRAS ABSOLUTAS (violação = output rejeitado):

1. CITAÇÕES OBRIGATÓRIAS: cada afirmação factual deve terminar com [PMID xxxxx] onde xxxxx é o PMID de um dos papers fornecidos. NUNCA inventes PMIDs. Se uma afirmação não pode ser apoiada por nenhum dos papers, NÃO a faças.

2. APENAS PMIDS FORNECIDOS: só podes citar PMIDs que aparecem na lista de papers fornecida. Qualquer PMID fora dessa lista será rejeitado.

3. SE A EVIDÊNCIA FOR INSUFICIENTE: diz isso explicitamente. Não forces uma conclusão. Marca evidence_strength como "insufficient".

4. LINGUAGEM CLÍNICA DIRETA: escreve para um dentista ocupado. Sem academês. Sem "pode ser que". Conclusões claras quando a evidência permite, hesitação clara quando não permite.

5. FORMATO MARKDOWN: usa as 4 secções H2 exatamente como pedido.

6. EVIDENCE STRENGTH: classifica como uma de: "high", "moderate", "low", "very_low", "insufficient". Baseia-te em: desenho dos estudos (SR/MA + RCTs vs observacional), consistência entre estudos, tamanho amostral, risco de viés.`;

export function buildSynthesisUserPrompt(opts: {
  rawQuestion: string;
  picoSummary: string;
  papers: Array<{
    pmid: string;
    title: string;
    abstract: string | null;
    authors: Array<{ name: string }>;
    year: number | null;
    journal: string | null;
    publicationTypes: string[];
  }>;
}): string {
  const paperBlocks = opts.papers
    .map(
      (p) =>
        `### PMID ${p.pmid}
- Título: ${p.title}
- Autores: ${p.authors
          .slice(0, 3)
          .map((a) => a.name)
          .join(', ')}${p.authors.length > 3 ? ' et al' : ''}
- Ano: ${p.year ?? '?'}
- Journal: ${p.journal ?? '?'}
- Tipo: ${p.publicationTypes.join(', ')}
- Abstract: ${p.abstract ?? '(sem abstract)'}`,
    )
    .join('\n\n');

  const allowedPmids = opts.papers.map((p) => p.pmid).join(', ');

  return `# Pergunta clínica
${opts.rawQuestion}

# PICO
${opts.picoSummary}

# Papers disponíveis (APENAS estes PMIDs podem ser citados)
PMIDs permitidos: ${allowedPmids}

${paperBlocks}

# Tarefa
Produz uma mini-síntese clínica em markdown com EXATAMENTE estas 4 secções, nesta ordem:

## O que a evidência mostra
[2-4 parágrafos sintetizando achados. Cada frase factual termina com [PMID xxxxx]]

## Força da evidência
[Classificação + 3-5 linhas de justificação. Pode citar PMIDs específicos como exemplos]

## Limitações e gaps
[O que NÃO sabemos. Onde os estudos são fracos. Cita PMIDs quando referires estudos específicos]

## Implicação clínica
[3-5 bullets práticos para o dentista usar amanhã no consultório]

No FIM do markdown, depois da última secção, adiciona uma linha exatamente assim:

EVIDENCE_STRENGTH: <high|moderate|low|very_low|insufficient>

Esta linha será extraída pelo backend.`;
}

export function buildSynthesisRetryPrompt(
  originalPrompt: string,
  validationErrors: string[],
): string {
  return `${originalPrompt}

# ATENÇÃO: tentativa anterior falhou validação
A tua resposta anterior continha estes erros:

${validationErrors.map((e) => `- ${e}`).join('\n')}

Reescreve a síntese inteira, corrigindo os erros. Lembra-te: SÓ podes citar PMIDs da lista fornecida. Cada afirmação factual TEM que ter [PMID xxxxx].`;
}
