// Pure timing math for the compositor. The body capture is crossfaded into the
// intro card and out to the outro card, so each card's effective length is its
// narration plus a hold pad, and the seams overlap by one fade duration.
export function computeTimeline({ introNarr, outroNarr, bodyDur, introPad = 1.4, outroPad = 2.0, fade = 0.5 }) {
  const I = introNarr + introPad; // intro card length
  const O = outroNarr + outroPad; // outro card length
  const bodyStart = I - fade; // body begins as the intro fades out
  const outroStart = I + bodyDur - 2 * fade; // outro begins as the body fades out
  const programDur = I + bodyDur + O - 2 * fade;
  return { I, O, bodyStart, outroStart, programDur };
}

// Linear gain in dB to move a measured integrated loudness onto a target.
// Integrated LUFS tracks a linear gain dB for dB, so this is exact.
export function gainToTargetDb(measuredLufs, targetLufs = -14) {
  return Number((targetLufs - measuredLufs).toFixed(2));
}
