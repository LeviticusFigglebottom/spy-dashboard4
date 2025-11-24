// src/utils/optionsCalculations.js
// Options Greeks and analytics - Black-Scholes calculations

/**
 * Normal CDF (Cumulative Distribution Function)
 */
export const normalCDF = (x) => {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
};

/**
 * Normal PDF (Probability Density Function)
 */
export const normalPDF = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

/**
 * Calculate Black-Scholes Greeks
 * @param {number} S - Spot price
 * @param {number} K - Strike price
 * @param {number} T - Time to expiration (years)
 * @param {number} r - Risk-free rate
 * @param {number} sigma - Volatility
 * @param {boolean} isCall - True for call, false for put
 */
export const calculateGreeks = (S, K, T, r, sigma, isCall) => {
  if (T <= 0 || !S || !sigma) {
    return { delta: 0, gamma: 0, vega: 0, theta: 0 };
  }

  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  const delta = isCall ? normalCDF(d1) : normalCDF(d1) - 1;
  const gamma = normalPDF(d1) / (S * sigma * Math.sqrt(T));
  const vega = S * normalPDF(d1) * Math.sqrt(T) / 100;
  const theta = isCall
    ? (-S * normalPDF(d1) * sigma / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * normalCDF(d2)) / 365
    : (-S * normalPDF(d1) * sigma / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * normalCDF(-d2)) / 365;

  return { delta, gamma, vega, theta };
};

/**
 * Calculate dealer gamma exposure from options chain
 */
export const calculateDealerMetrics = (options, spy) => {
  if (!options.length || !spy) return null;

  const strikeMap = {};

  options.forEach(opt => {
    if (!strikeMap[opt.strike]) {
      strikeMap[opt.strike] = {
        strike: opt.strike,
        callGamma: 0,
        putGamma: 0,
        callDelta: 0,
        putDelta: 0,
        netGamma: 0,
        netDelta: 0
      };
    }

    const notional = opt.oi * 100 * -1; // Dealers are short customer longs

    if (opt.type === 'CALL') {
      strikeMap[opt.strike].callGamma += opt.gamma * notional;
      strikeMap[opt.strike].callDelta += opt.delta * notional;
    } else {
      strikeMap[opt.strike].putGamma += opt.gamma * notional;
      strikeMap[opt.strike].putDelta += opt.delta * notional;
    }
  });

  Object.values(strikeMap).forEach(s => {
    s.netGamma = s.callGamma + s.putGamma;
    s.netDelta = s.callDelta + s.putDelta;
  });

  const strikes = Object.values(strikeMap).sort((a, b) => a.strike - b.strike);
  const totalGamma = strikes.reduce((sum, s) => sum + s.netGamma, 0);
  const totalDelta = strikes.reduce((sum, s) => sum + s.netDelta, 0);

  // Find gamma flip point
  let gammaFlip = null;
  for (let i = 0; i < strikes.length - 1; i++) {
    if (strikes[i].netGamma * strikes[i + 1].netGamma < 0) {
      gammaFlip = (strikes[i].strike + strikes[i + 1].strike) / 2;
      break;
    }
  }

  return {
    strikes,
    totalGamma,
    totalDelta,
    gammaFlipPoint: gammaFlip,
    isShortGamma: totalGamma < 0,
    maxGammaStrike: strikes.reduce((max, s) =>
      Math.abs(s.netGamma) > Math.abs(max.netGamma) ? s : max, strikes[0])
  };
};

/**
 * Calculate volatility metrics from options chain
 */
export const calculateVolatilityMetrics = async (options, spy, vix) => {
  if (!options.length) return null;

  const atmOpts = options.filter(o => Math.abs(o.strike - spy) < 5);
  const atmIV = atmOpts.reduce((sum, o) => sum + o.iv, 0) / atmOpts.length;

  const calls = options.filter(o => o.type === 'CALL');
  const puts = options.filter(o => o.type === 'PUT');
  const pcrVol = puts.reduce((s, p) => s + p.volume, 0) / Math.max(1, calls.reduce((s, c) => s + c.volume, 0));
  const pcrOI = puts.reduce((s, p) => s + p.oi, 0) / Math.max(1, calls.reduce((s, c) => s + c.oi, 0));

  const otmPuts = options.filter(o => o.type === 'PUT' && o.strike < spy * 0.95);
  const otmCalls = options.filter(o => o.type === 'CALL' && o.strike > spy * 1.05);
  const putIV = otmPuts.length > 0 ? otmPuts.reduce((s, o) => s + o.iv, 0) / otmPuts.length : atmIV;
  const callIV = otmCalls.length > 0 ? otmCalls.reduce((s, o) => s + o.iv, 0) / otmCalls.length : atmIV;
  const ivSkew = putIV - callIV;

  const hv = 0.15; // Would need historical calculation

  return {
    atmIV,
    historicalVol: hv,
    ivHVSpread: atmIV - hv,
    pcrVolume: pcrVol,
    pcrOI,
    ivSkew,
    vixLevel: vix
  };
};

/**
 * Calculate IV skew curve
 */
export const calculateSkewCurve = (options, spy) => {
  const firstExp = options.filter(o => o.daysToExp < 8);
  const strikeIVMap = {};

  firstExp.forEach(opt => {
    const key = opt.strike;
    if (!strikeIVMap[key]) {
      strikeIVMap[key] = { strike: key, callIV: 0, putIV: 0, calls: 0, puts: 0 };
    }
    if (opt.type === 'CALL') {
      strikeIVMap[key].callIV += opt.iv;
      strikeIVMap[key].calls++;
    } else {
      strikeIVMap[key].putIV += opt.iv;
      strikeIVMap[key].puts++;
    }
  });

  return Object.values(strikeIVMap)
    .map(s => ({
      strike: s.strike,
      moneyness: ((s.strike / spy - 1) * 100).toFixed(1),
      callIV: s.calls > 0 ? (s.callIV / s.calls * 100).toFixed(2) : 0,
      putIV: s.puts > 0 ? (s.putIV / s.puts * 100).toFixed(2) : 0,
      avgIV: ((s.callIV / s.calls + s.putIV / s.puts) / 2 * 100).toFixed(2)
    }))
    .filter(s => Math.abs(s.strike - spy) < 30)
    .sort((a, b) => a.strike - b.strike);
};

/**
 * Generate market prediction from metrics
 */
export const generatePrediction = (volMetrics, dealerMetrics, spy, skew) => {
  if (!volMetrics || !dealerMetrics) return null;

  let bull = 0, bear = 0;
  const signals = [];

  if (dealerMetrics.isShortGamma) {
    if (spy > dealerMetrics.gammaFlipPoint) {
      bull += 2;
      signals.push({ factor: 'Dealer Short Gamma Above Flip', sentiment: 'bullish', weight: 2 });
    } else {
      bear += 2;
      signals.push({ factor: 'Dealer Short Gamma Below Flip', sentiment: 'bearish', weight: 2 });
    }
  } else {
    bear += 1;
    signals.push({ factor: 'Dealer Long Gamma (Dampening)', sentiment: 'bearish', weight: 1 });
  }

  if (volMetrics.pcrVolume > 1.2) {
    bull += 1;
    signals.push({ factor: 'High Put Buying (PCR > 1.2)', sentiment: 'bullish', weight: 1 });
  } else if (volMetrics.pcrVolume < 0.7) {
    bear += 1;
    signals.push({ factor: 'High Call Buying (PCR < 0.7)', sentiment: 'bearish', weight: 1 });
  }

  if (volMetrics.ivHVSpread > 0.05) {
    bear += 1;
    signals.push({ factor: 'IV Premium to HV (Fear)', sentiment: 'bearish', weight: 1 });
  } else if (volMetrics.ivHVSpread < -0.02) {
    bull += 1;
    signals.push({ factor: 'IV Discount to HV', sentiment: 'bullish', weight: 1 });
  }

  if (volMetrics.vixLevel > 25) {
    bull += 2;
    signals.push({ factor: 'Elevated VIX (>25)', sentiment: 'bullish', weight: 2 });
  } else if (volMetrics.vixLevel < 12) {
    bear += 1;
    signals.push({ factor: 'Low VIX (<12)', sentiment: 'bearish', weight: 1 });
  }

  if (volMetrics.ivSkew > 0.05) {
    bear += 1;
    signals.push({ factor: 'High Put Skew (>5%)', sentiment: 'bearish', weight: 1 });
  }

  if (skew > 140) {
    bear += 2;
    signals.push({ factor: 'Elevated SKEW (>140)', sentiment: 'bearish', weight: 2 });
  } else if (skew < 120) {
    bull += 1;
    signals.push({ factor: 'Low SKEW (<120)', sentiment: 'bullish', weight: 1 });
  }

  return {
    prediction: bull > bear ? 'BULLISH' : 'BEARISH',
    confidence: Math.abs(bull - bear) / (bull + bear),
    signals,
    bullishScore: bull,
    bearishScore: bear,
    timestamp: new Date().toISOString(),
    spyPriceAtPrediction: spy
  };
};
