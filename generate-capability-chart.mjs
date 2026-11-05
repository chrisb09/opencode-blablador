import { writeFileSync } from 'node:fs';

// Scores are strings to preserve published precision; null means unavailable.
// The optional third field is the reported DeepSWE uncertainty in percentage points.
const models = [
  ['GPT-OSS-120B', ['80.1', null, null]],
  ['Qwen3.8-Flash-Next-NVFP4', ['91.5', null, '82.9']],
  ['Qwen3.8-27B-FP8*', ['89.2', null, '73.0']],
  ['DeepSeek-V4.1-Flash-1017', [null, '77.0', null]],
  ['MiMo-V2.6-Flash-RL*', [null, '67.9', '87.6']],
  ['GLM-5.3-Flash', [null, '63', null], 4],
  ['Kimi-K3-1M', [null, '69', null], 5],
  ['DeepSeek-V4.1-Flash-HZDR', [null, null, null]],
  ['Muse-Spark-Open-816B-A42B', ['89.0', '60', '76.4']],
  ['Swift-1.5-Qwen3.8-27B*', ['88.59', null, '72.13']],
  ['GPT-5.5', ['93.6', '67', null], 6],
  ['GPT-5.4 mini', ['88.0', null, '66.1']],
  ['Claude Opus 4.6', [null, null, '70.1']],
];
const metrics = [
  ['GPQA Diamond', '#0072b2'],
  ['DeepSWE v1.1', '#d55e00'],
  ['Terminal-Bench 2.1', '#009e73'],
];
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const y = value => 500 - Number(value) * 3.4;
const lines = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="1810" height="940" viewBox="0 0 1810 940" role="img" aria-labelledby="title desc">',
  '<title id="title">Published capability scores by model and benchmark</title>',
  '<desc id="desc">Grouped columns for ten Blablador model IDs and three reference models. Dashes mark unavailable scores. Error bars show reported DeepSWE uncertainties. These scores are not measurements of Blablador deployments or a controlled comparison; see the README for sources and qualifications.</desc>',
  '<rect width="1810" height="940" fill="#f8fafc"/>',
  '<g font-family="sans-serif">',
  '<text x="70" y="43" fill="#102a43" font-size="27" font-weight="700">Published capability scores</text>',
  '<text x="70" y="72" fill="#7b341e" font-size="17" font-weight="700">Not a controlled comparison; not measured on Blablador deployments. See README for qualifications.</text>',
  '<text x="70" y="108" fill="#243b53" font-size="16" font-weight="700">Reported score (%)</text>',
];
metrics.forEach(([name, color], i) => {
  const x = 390 + i * 250;
  lines.push(`<rect x="${x}" y="92" width="18" height="18" fill="${color}"/><text x="${x + 26}" y="107" fill="#243b53" font-size="16">${name}</text>`);
});
lines.push('<text x="1180" y="107" fill="#243b53" font-size="16">— = N/A; whiskers = reported ± uncertainty</text>');
for (let tick = 0; tick <= 100; tick += 20) {
  lines.push(`<path d="M80 ${y(tick)}H1770" stroke="#d9e2ec"/><text x="69" y="${y(tick) + 5}" text-anchor="end" fill="#486581" font-size="14">${tick}</text>`);
}
lines.push('<path d="M80 160V500H1770" fill="none" stroke="#627d98"/>');
lines.push('<text x="690" y="143" text-anchor="middle" fill="#243b53" font-size="16" font-weight="700">Blablador model IDs</text>');
lines.push('<text x="1564" y="143" text-anchor="middle" fill="#243b53" font-size="16" font-weight="700">Reference models</text>');
lines.push('<path d="M1375 125V520" stroke="#627d98" stroke-width="2" stroke-dasharray="6 5"/>');
models.forEach(([name, scores, uncertainty], i) => {
  const base = 100 + i * 128 + (i >= 10 ? 18 : 0);
  scores.forEach((score, j) => {
    const x = base + j * 32;
    if (score === null) {
      lines.push(`<text x="${x + 13}" y="492" text-anchor="middle" fill="#334e68" font-size="19" font-weight="700">—</text>`);
      return;
    }
    const top = y(score);
    lines.push(`<rect x="${x}" y="${top}" width="26" height="${500 - top}" fill="${metrics[j][1]}"/>`);
    lines.push(`<text transform="translate(${x + 18} 485) rotate(-90)" fill="#fff" font-size="14" font-weight="700">${esc(score)}</text>`);
    if (j === 1 && uncertainty) {
      const high = y(Number(score) + uncertainty), low = y(Number(score) - uncertainty), center = x + 13;
      lines.push(`<path d="M${center} ${high}V${low} M${center - 8} ${high}H${center + 8} M${center - 8} ${low}H${center + 8}" stroke="#102a43" stroke-width="2.5"/>`);
    }
  });
  lines.push(`<text transform="translate(${base + 49} 520) rotate(-55)" text-anchor="end" fill="#243b53" font-size="16">${esc(name)}</text>`);
});
lines.push('<text x="70" y="885" fill="#486581" font-size="16">* Qwen 27B FP8 evaluation unconfirmed; MiMo is a Flash family score; Swift is BF16. See README.</text>');
lines.push('<text x="70" y="911" fill="#486581" font-size="16">Different sources, harnesses, precision and quantization; benchmark versions are not interchangeable.</text>');
lines.push('</g></svg>');
writeFileSync(new URL('./assets/capability.svg', import.meta.url), lines.join('\n') + '\n');
