/**
 * Constants for ConceptSpaceService: negation detection and antonym pairs.
 * Extracted from service to avoid hardcoding linguistic data in business logic.
 */

/** Words indicating negation across supported languages (Russian + English). */
export const NEGATION_WORDS: readonly string[] = [
  'не', 'нет', 'без', 'никогда',
  'not', 'no', 'without', 'never', 'unlike',
];

/**
 * Explicit antonym pairs for opposition detection.
 * Each pair [wordA, wordB] means traces containing A and B are potentially in conflict.
 */
export const ANTONYM_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['круглый', 'угловатый'], ['круглая', 'угловатая'], ['круглое', 'угловатое'],
  ['катится', 'не катится'], ['гладкий', 'шершавый'],
  ['большой', 'маленький'], ['тяжёлый', 'лёгкий'],
  ['round', 'angular'], ['rolls', "doesn't roll"],
];
