// Helpers pour les axes des charts Recharts.

/**
 * Calcule un max d'axe Y "joli" :
 *  - 106 000 -> 120 000
 *  - 300 000 -> 350 000
 *  - 900 000 -> 1 000 000
 *  - 50      -> 60
 * Toujours strictement au-dessus du max (pour ne pas coller le point au sommet),
 * et toujours un chiffre "rond" sur lequel l'utilisateur peut s'appuyer.
 */
export function niceAxisMax(dataMax) {
  if (!dataMax || dataMax <= 0) return 10;
  const target = dataMax * 1.05; // +5% mini pour eviter "pile sur le sommet"
  const magnitude = Math.pow(10, Math.floor(Math.log10(target)));
  const normalized = target / magnitude;
  // Multipliers "ronds" tries croissants pour des graduations naturelles
  const nice = [1, 1.1, 1.2, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10];
  for (const m of nice) {
    if (normalized <= m) return Math.round(m * magnitude);
  }
  return Math.round(10 * magnitude);
}
