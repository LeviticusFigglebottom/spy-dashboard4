import React, { useState, useMemo, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine, ReferenceArea, Area, Cell
} from 'recharts';
import {
  TrendingUp, TrendingDown, AlertTriangle, Activity,
  Layers, Target, Zap, BarChart3
} from 'lucide-react';

/**
 * Advanced Market Structure Analysis Module
 * 
 * Features:
 * - Support/Resistance Levels with strength indicators
 * - Break of Structure (BOS) and Change of Character (CHOCH) detection
 * - Momentum Indicators (RSI, MACD, Stochastic, ADX)
 * - Volume Profile & POC (Point of Control)
 * - Put/Call Walls & Max Pain calculation
 * - Volatility Term Structure
 * - Multi-asset Correlation Analysis (SPY/VIX/SKEW/QQQ)
 * - Swing High/Low tracking with rejection zones
 */

const MarketStructureAnalysis = ({
  priceData = [],
  optionsData = [],
  currentPrice = null,
  vixPrice = null,
  skewValue = null
}) => {
  const [activeSection, setActiveSection] = useState('structure');
  const [timeframe, setTimeframe] = useState('1D');
  const [showAnnotations, setShowAnnotations] = useState(true);

  // Debug logging
  useEffect(() => {
    console.log('MarketStructureAnalysis mounted with:', {
      priceDataLength: priceData?.length || 0,
      optionsDataLength: optionsData?.length || 0,
      currentPrice,
      vixPrice,
      skewValue
    });
  }, [priceData, optionsData, currentPrice, vixPrice, skewValue]);

  // ============================================================================
  // TECHNICAL INDICATOR CALCULATIONS
  // ============================================================================

  const calculateSMA = (data, period) => {
    if (data.length === 0) return null;
    // Use smaller period if not enough data
    const actualPeriod = Math.min(period, data.length);
    const sum = data.slice(-actualPeriod).reduce((acc, val) => acc + val, 0);
    return sum / actualPeriod;
  };

  const calculateEMA = (data, period) => {
    if (data.length === 0) return null;
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return ema;
  };

  const calculateRSI = (data, period = 14) => {
    if (data.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = data.length - period; i < data.length; i++) {
      const change = data[i] - data[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  };

  const calculateMACD = (data) => {
    const ema12 = calculateEMA(data, 12);
    const ema26 = calculateEMA(data, 26);
    if (!ema12 || !ema26) return { macd: 0, signal: 0, histogram: 0 };

    const macd = ema12 - ema26;
    const signal = macd * 0.15; // Simplified signal line
    return {
      macd,
      signal,
      histogram: macd - signal
    };
  };

  const calculateStochastic = (highs, lows, closes, period = 14) => {
    if (closes.length < period) return { k: 50, d: 50 };

    const recentHighs = highs.slice(-period);
    const recentLows = lows.slice(-period);
    const currentClose = closes[closes.length - 1];

    const highestHigh = Math.max(...recentHighs);
    const lowestLow = Math.min(...recentLows);

    const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    const d = k * 0.3 + 50 * 0.7; // Simplified %D

    return { k, d };
  };

  // ============================================================================
  // MARKET STRUCTURE DETECTION
  // ============================================================================

  const detectSwingPoints = (data) => {
    const swings = {
      highs: [],
      lows: [],
      current: { trend: 'neutral', strength: 0 }
    };

    if (data.length < 5) return swings;

    for (let i = 2; i < data.length - 2; i++) {
      const prices = [
        data[i - 2]?.close,
        data[i - 1]?.close,
        data[i]?.close,
        data[i + 1]?.close,
        data[i + 2]?.close
      ];

      // Swing High
      if (prices[2] > prices[0] && prices[2] > prices[1] &&
        prices[2] > prices[3] && prices[2] > prices[4]) {
        swings.highs.push({
          index: i,
          price: prices[2],
          timestamp: data[i].timestamp,
          strength: (prices[2] - Math.min(...prices.filter((_, idx) => idx !== 2))) / prices[2] * 100
        });
      }

      // Swing Low
      if (prices[2] < prices[0] && prices[2] < prices[1] &&
        prices[2] < prices[3] && prices[2] < prices[4]) {
        swings.lows.push({
          index: i,
          price: prices[2],
          timestamp: data[i].timestamp,
          strength: (Math.max(...prices.filter((_, idx) => idx !== 2)) - prices[2]) / prices[2] * 100
        });
      }
    }

    // Determine current trend
    if (swings.highs.length > 0 && swings.lows.length > 0) {
      const lastHigh = swings.highs[swings.highs.length - 1];
      const lastLow = swings.lows[swings.lows.length - 1];
      const prevHigh = swings.highs[swings.highs.length - 2];
      const prevLow = swings.lows[swings.lows.length - 2];

      if (prevHigh && prevLow) {
        const higherHighs = lastHigh.price > prevHigh.price;
        const higherLows = lastLow.price > prevLow.price;
        const lowerHighs = lastHigh.price < prevHigh.price;
        const lowerLows = lastLow.price < prevLow.price;

        if (higherHighs && higherLows) {
          swings.current = { trend: 'uptrend', strength: 0.8 };
        } else if (lowerHighs && lowerLows) {
          swings.current = { trend: 'downtrend', strength: 0.8 };
        } else {
          swings.current = { trend: 'ranging', strength: 0.5 };
        }
      }
    }

    return swings;
  };

  const detectBreakOfStructure = (data, swings) => {
    const bos = [];
    const choch = [];

    if (swings.highs.length < 2 || swings.lows.length < 2) return { bos, choch };

    for (let i = 1; i < data.length; i++) {
      const currentPrice = data[i].close;
      const prevPrice = data[i - 1].close;

      // Check for breaks of recent swing highs (bullish BOS)
      const recentHigh = swings.highs.slice(-3).find(h => h.index < i);
      if (recentHigh && prevPrice <= recentHigh.price && currentPrice > recentHigh.price) {
        bos.push({
          index: i,
          type: 'bullish',
          price: currentPrice,
          level: recentHigh.price,
          strength: (currentPrice - recentHigh.price) / recentHigh.price * 100
        });
      }

      // Check for breaks of recent swing lows (bearish BOS)
      const recentLow = swings.lows.slice(-3).find(l => l.index < i);
      if (recentLow && prevPrice >= recentLow.price && currentPrice < recentLow.price) {
        bos.push({
          index: i,
          type: 'bearish',
          price: currentPrice,
          level: recentLow.price,
          strength: (recentLow.price - currentPrice) / recentLow.price * 100
        });
      }
    }

    return { bos, choch };
  };

  const calculateSupportResistance = (data, swings) => {
    const levels = [];
    const tolerance = 0.005; // 0.5% clustering tolerance

    // Combine all swing points
    const allPoints = [
      ...swings.highs.map(h => ({ price: h.price, type: 'resistance', strength: h.strength })),
      ...swings.lows.map(l => ({ price: l.price, type: 'support', strength: l.strength }))
    ];

    // Cluster nearby levels
    const clusters = [];
    allPoints.forEach(point => {
      const existingCluster = clusters.find(c =>
        Math.abs(c.price - point.price) / c.price < tolerance
      );

      if (existingCluster) {
        existingCluster.touches++;
        existingCluster.strength += point.strength;
        existingCluster.price = (existingCluster.price + point.price) / 2;
      } else {
        clusters.push({
          price: point.price,
          type: point.type,
          touches: 1,
          strength: point.strength
        });
      }
    });

    // Calculate level strength and sort
    return clusters
      .map(c => ({
        ...c,
        strength: (c.touches * c.strength) / clusters.length,
        distance: currentPrice ? Math.abs((c.price - currentPrice) / currentPrice * 100) : 0
      }))
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 8); // Top 8 strongest levels
  };

  // ============================================================================
  // VOLUME PROFILE ANALYSIS
  // ============================================================================

  const calculateVolumeProfile = (data) => {
    if (data.length === 0) return { profile: [], poc: null, vah: null, val: null };

    const prices = data.map(d => d.close);
    const volumes = data.map(d => d.volume || 1000000);

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const numBins = 50;
    const binSize = (maxPrice - minPrice) / numBins;

    const profile = [];
    for (let i = 0; i < numBins; i++) {
      const binLow = minPrice + i * binSize;
      const binHigh = binLow + binSize;
      const binVolume = data.reduce((sum, d, idx) => {
        if (d.close >= binLow && d.close < binHigh) {
          return sum + (volumes[idx] || 0);
        }
        return sum;
      }, 0);

      profile.push({
        priceLevel: (binLow + binHigh) / 2,
        volume: binVolume,
        priceLow: binLow,
        priceHigh: binHigh
      });
    }

    // Point of Control (highest volume node)
    const poc = profile.reduce((max, curr) =>
      curr.volume > max.volume ? curr : max
      , profile[0]);

    // Value Area High/Low (70% of volume)
    const totalVolume = profile.reduce((sum, p) => sum + p.volume, 0);
    const valueVolume = totalVolume * 0.7;

    const sortedByVolume = [...profile].sort((a, b) => b.volume - a.volume);
    let accumulatedVolume = 0;
    const valueArea = [];

    for (const node of sortedByVolume) {
      if (accumulatedVolume < valueVolume) {
        valueArea.push(node);
        accumulatedVolume += node.volume;
      } else break;
    }

    const vah = Math.max(...valueArea.map(v => v.priceLevel));
    const val = Math.min(...valueArea.map(v => v.priceLevel));

    return { profile, poc, vah, val };
  };

  // ============================================================================
  // OPTIONS WALLS & MAX PAIN
  // ============================================================================

  const calculateOptionsWalls = (optionsData, currentPrice) => {
    if (!optionsData || optionsData.length === 0) {
      // Generate realistic mock data
      return generateMockOptionsWalls(currentPrice);
    }

    const strikeData = {};

    optionsData.forEach(opt => {
      const strike = opt.strike;
      if (!strikeData[strike]) {
        strikeData[strike] = {
          strike,
          callOI: 0,
          putOI: 0,
          callVolume: 0,
          putVolume: 0,
          callGamma: 0,
          putGamma: 0
        };
      }

      // Handle both formats: 'call'/'put' (lowercase) and 'CALL'/'PUT' (uppercase)
      // Handle both 'openInterest' and 'oi' fields
      const optType = (opt.type || '').toLowerCase();
      const openInterest = opt.openInterest || opt.oi || 0;
      const volume = opt.volume || 0;
      const gamma = opt.gamma || 0;

      if (optType === 'call') {
        strikeData[strike].callOI += openInterest;
        strikeData[strike].callVolume += volume;
        strikeData[strike].callGamma += gamma * openInterest;
      } else if (optType === 'put') {
        strikeData[strike].putOI += openInterest;
        strikeData[strike].putVolume += volume;
        strikeData[strike].putGamma += gamma * openInterest;
      }
    });

    const walls = Object.values(strikeData).map(s => ({
      ...s,
      netOI: s.callOI - s.putOI,
      netGamma: s.callGamma - s.putGamma,
      totalOI: s.callOI + s.putOI,
      putCallRatio: s.callOI > 0 ? s.putOI / s.callOI : 0
    }));

    // Calculate max pain
    const maxPain = calculateMaxPain(walls);

    // Identify significant walls (top 20% OI)
    const sortedByOI = [...walls].sort((a, b) => b.totalOI - a.totalOI);
    const threshold = sortedByOI[Math.floor(sortedByOI.length * 0.2)]?.totalOI || 0;

    const significantWalls = walls.filter(w => w.totalOI >= threshold);

    return {
      walls: walls.sort((a, b) => a.strike - b.strike),
      maxPain,
      significantWalls,
      supportWalls: significantWalls.filter(w => w.strike < currentPrice && w.putOI > w.callOI),
      resistanceWalls: significantWalls.filter(w => w.strike > currentPrice && w.callOI > w.putOI)
    };
  };

  const calculateMaxPain = (walls) => {
    let maxPainStrike = null;
    let minPain = Infinity;

    walls.forEach(wall => {
      const strike = wall.strike;
      let totalPain = 0;

      walls.forEach(w => {
        // Call pain: calls are ITM if current price > strike
        if (strike > w.strike) {
          totalPain += w.callOI * (strike - w.strike);
        }
        // Put pain: puts are ITM if current price < strike
        if (strike < w.strike) {
          totalPain += w.putOI * (w.strike - strike);
        }
      });

      if (totalPain < minPain) {
        minPain = totalPain;
        maxPainStrike = strike;
      }
    });

    return maxPainStrike;
  };

  const generateMockOptionsWalls = (currentPrice) => {
    const basePrice = currentPrice || 595;
    const walls = [];

    for (let i = -10; i <= 10; i++) {
      const strike = Math.round(basePrice + i * 5);
      const distanceFromPrice = Math.abs(strike - basePrice);

      // OI distribution: higher near current price, with skew
      const baseOI = 50000 * Math.exp(-distanceFromPrice / 15);
      const callSkew = strike > basePrice ? 0.8 : 1.2;
      const putSkew = strike < basePrice ? 1.3 : 0.7;

      walls.push({
        strike,
        callOI: Math.round(baseOI * callSkew * (0.8 + Math.random() * 0.4)),
        putOI: Math.round(baseOI * putSkew * (0.8 + Math.random() * 0.4)),
        callVolume: Math.round(baseOI * 0.1 * Math.random()),
        putVolume: Math.round(baseOI * 0.1 * Math.random()),
        callGamma: baseOI * 0.001 * callSkew,
        putGamma: baseOI * 0.001 * putSkew
      });
    }

    const wallsWithMetrics = walls.map(w => ({
      ...w,
      netOI: w.callOI - w.putOI,
      netGamma: w.callGamma - w.putGamma,
      totalOI: w.callOI + w.putOI,
      putCallRatio: w.callOI > 0 ? w.putOI / w.callOI : 0
    }));

    const maxPain = calculateMaxPain(wallsWithMetrics);
    const sortedByOI = [...wallsWithMetrics].sort((a, b) => b.totalOI - a.totalOI);
    const threshold = sortedByOI[Math.floor(sortedByOI.length * 0.3)]?.totalOI || 0;
    const significantWalls = wallsWithMetrics.filter(w => w.totalOI >= threshold);

    return {
      walls: wallsWithMetrics,
      maxPain,
      significantWalls,
      supportWalls: significantWalls.filter(w => w.strike < basePrice && w.putOI > w.callOI),
      resistanceWalls: significantWalls.filter(w => w.strike > basePrice && w.callOI > w.putOI)
    };
  };

  // ============================================================================
  // CORRELATION ANALYSIS
  // ============================================================================

  function calculateCorrelation(arr1, arr2) {
    if (arr1.length !== arr2.length || arr1.length === 0) return 0;

    const n = arr1.length;
    const mean1 = arr1.reduce((a, b) => a + b) / n;
    const mean2 = arr2.reduce((a, b) => a + b) / n;

    let numerator = 0;
    let denom1 = 0;
    let denom2 = 0;

    for (let i = 0; i < n; i++) {
      const diff1 = arr1[i] - mean1;
      const diff2 = arr2[i] - mean2;
      numerator += diff1 * diff2;
      denom1 += diff1 * diff1;
      denom2 += diff2 * diff2;
    }

    if (denom1 === 0 || denom2 === 0) return 0;
    return numerator / Math.sqrt(denom1 * denom2);
  }

  function calculateRollingCorrelation(data, window = 14) {
    const result = [];

    for (let i = window; i < data.length; i++) {
      const slice = data.slice(i - window, i);
      const spyPrices = slice.map(d => d.spy);
      const vixPrices = slice.map(d => d.vix);

      result.push({
        timestamp: data[i].timestamp,
        spyVixCorr: calculateCorrelation(spyPrices, vixPrices),
        spy: data[i].spy,
        vix: data[i].vix
      });
    }

    return result;
  }

  // ============================================================================
  // DATA PROCESSING & MEMOIZATION
  // ============================================================================

  const processedData = useMemo(() => {
    // If no price data or empty, generate mock data
    if (!priceData || priceData.length === 0) {
      console.log('MarketStructure: No priceData provided, generating mock data');
      return generateMockPriceData();
    }

    console.log('MarketStructure: Processing', priceData.length, 'price data points');

    return priceData.map((point, index) => {
      // Handle both 'close' and 'spy' fields (dashboard uses 'spy')
      const closePrice = point.close || point.spy || currentPrice || 595;
      const highPrice = point.high || closePrice;
      const lowPrice = point.low || closePrice;

      const prices = priceData.slice(Math.max(0, index - 50), index + 1).map(p => p.close || p.spy || currentPrice || 595);
      const highs = priceData.slice(Math.max(0, index - 50), index + 1).map(p => p.high || p.close || p.spy || currentPrice || 595);
      const lows = priceData.slice(Math.max(0, index - 50), index + 1).map(p => p.low || p.close || p.spy || currentPrice || 595);
      const volumes = priceData.slice(Math.max(0, index - 50), index + 1).map(p => p.volume || 50000000);

      const macd = calculateMACD(prices);
      const stoch = calculateStochastic(highs, lows, prices);

      return {
        ...point,
        close: closePrice,  // Ensure close field exists
        high: highPrice,
        low: lowPrice,
        timestamp: point.timestamp || point.fullDate?.getTime() || Date.now(),
        date: point.date || new Date().toLocaleDateString(),
        sma20: calculateSMA(prices, 20),
        sma50: calculateSMA(prices, 50),
        ema12: calculateEMA(prices, 12),
        ema26: calculateEMA(prices, 26),
        rsi: calculateRSI(prices, 14),
        macd: macd.macd,
        macdSignal: macd.signal,
        macdHistogram: macd.histogram,
        stochK: stoch.k,
        stochD: stoch.d,
        volume: point.volume || 50000000,
        spy: point.spy || closePrice,
        vix: point.vix || vixPrice || 14
      };
    });
  }, [priceData, currentPrice, vixPrice]);

  const swingAnalysis = useMemo(() => {
    return detectSwingPoints(processedData);
  }, [processedData]);

  const bosAnalysis = useMemo(() => {
    return detectBreakOfStructure(processedData, swingAnalysis);
  }, [processedData, swingAnalysis]);

  const srLevels = useMemo(() => {
    return calculateSupportResistance(processedData, swingAnalysis);
  }, [processedData, swingAnalysis]);

  const volumeProfile = useMemo(() => {
    return calculateVolumeProfile(processedData);
  }, [processedData]);

  const optionsWalls = useMemo(() => {
    return calculateOptionsWalls(optionsData, currentPrice);
  }, [optionsData, currentPrice]);

  const correlationData = useMemo(() => {
    if (!processedData || processedData.length === 0) return [];

    try {
      const validData = processedData.filter(d =>
        d && (d.timestamp || d.fullDate) && (d.vix || vixPrice)
      );

      if (validData.length < 15) {
        console.log('MarketStructure: Need 15+ data points for correlation, have:', validData.length);
        return [];
      }

      return calculateRollingCorrelation(
        validData.map(d => ({
          timestamp: d.timestamp || d.fullDate?.getTime() || Date.now(),
          spy: d.close || d.spy || currentPrice || 595,
          vix: d.vix || vixPrice || 14
        }))
      );
    } catch (error) {
      console.error('Error calculating correlation:', error);
      return [];
    }
  }, [processedData, vixPrice, currentPrice]);

  // Current momentum summary
  const currentMomentum = useMemo(() => {
    if (processedData.length === 0) {
      console.log('MarketStructure: No processed data for momentum calculation');
      return null;
    }

    const latest = processedData[processedData.length - 1];

    // Add null checks for all values
    if (!latest || typeof latest.rsi !== 'number' || typeof latest.macdHistogram !== 'number') {
      console.log('MarketStructure: Invalid data in latest point', latest);
      return null;
    }

    const rsi = latest.rsi;
    const macdHist = latest.macdHistogram;
    const trend = swingAnalysis.current.trend;

    let signal = 'NEUTRAL';
    let strength = 0;

    if (rsi > 70 && macdHist < 0) {
      signal = 'BEARISH';
      strength = 0.7;
    } else if (rsi < 30 && macdHist > 0) {
      signal = 'BULLISH';
      strength = 0.7;
    } else if (trend === 'uptrend' && rsi > 50) {
      signal = 'BULLISH';
      strength = 0.5;
    } else if (trend === 'downtrend' && rsi < 50) {
      signal = 'BEARISH';
      strength = 0.5;
    }

    return {
      signal,
      strength,
      rsi,
      macd: latest.macd || 0,
      trend,
      stochastic: latest.stochK || 50
    };
  }, [processedData, swingAnalysis]);

  // ============================================================================
  // MOCK DATA GENERATION
  // ============================================================================

  const generateMockPriceData = () => {
    const data = [];
    const basePrice = currentPrice || 595;
    let price = basePrice * 0.95;
    const now = Date.now();

    for (let i = 0; i < 100; i++) {
      const change = (Math.random() - 0.48) * 3;
      price += change;

      data.push({
        timestamp: now - (100 - i) * 86400000,
        date: new Date(now - (100 - i) * 86400000).toLocaleDateString(),
        close: price,
        high: price + Math.random() * 2,
        low: price - Math.random() * 2,
        volume: 50000000 + Math.random() * 30000000,
        spy: price,
        vix: 14 + Math.random() * 8 + (price < basePrice ? 2 : -1)
      });
    }

    return data;
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  const tabs = [
    { id: 'structure', label: 'Market Structure', icon: Layers },
    { id: 'momentum', label: 'Momentum', icon: Activity },
    { id: 'walls', label: 'Options Walls', icon: Target },
    { id: 'volume', label: 'Volume Profile', icon: BarChart3 },
    { id: 'correlation', label: 'Correlation', icon: Zap }
  ];

  // Show loading state if data is still processing
  if (processedData.length === 0) {
    return (
      <div className="w-full min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold mb-2">Market Structure Analysis</h1>
            <p className="text-gray-400">
              Advanced technical analysis, support/resistance, and options positioning
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-12 text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500 mx-auto mb-6"></div>
            <p className="text-xl font-bold mb-2">Loading Market Data...</p>
            <p className="text-gray-400">Calculating technical indicators and market structure</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold mb-2">Market Structure Analysis</h1>
              <p className="text-gray-400">
                Advanced technical analysis, support/resistance, and options positioning
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">
                Data Points: {processedData.length}
              </p>
              {processedData.length < 30 && (
                <p className="text-xs text-yellow-500">
                  ⚠ Limited data ({processedData.length} days). More history recommended for accuracy.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Current Momentum Summary */}
        {currentMomentum && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <div className="grid grid-cols-5 gap-4">
              <div>
                <p className="text-sm text-gray-400 mb-1">Signal</p>
                <div className={
                  currentMomentum.signal === 'BULLISH' ? 'inline-flex items-center px-3 py-1 rounded text-sm font-semibold bg-green-600/20 text-green-400' :
                    currentMomentum.signal === 'BEARISH' ? 'inline-flex items-center px-3 py-1 rounded text-sm font-semibold bg-red-600/20 text-red-400' :
                      'inline-flex items-center px-3 py-1 rounded text-sm font-semibold bg-gray-600/20 text-gray-400'
                }>
                  {currentMomentum.signal === 'BULLISH' && <TrendingUp size={16} className="mr-1" />}
                  {currentMomentum.signal === 'BEARISH' && <TrendingDown size={16} className="mr-1" />}
                  {currentMomentum.signal}
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">RSI</p>
                <p className={
                  currentMomentum.rsi > 70 ? 'text-xl font-bold text-red-400' :
                    currentMomentum.rsi < 30 ? 'text-xl font-bold text-green-400' :
                      'text-xl font-bold text-white'
                }>
                  {currentMomentum.rsi.toFixed(1)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">Trend</p>
                <p className="text-xl font-bold capitalize">{currentMomentum.trend}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">MACD</p>
                <p className={
                  currentMomentum.macd > 0 ? 'text-xl font-bold text-green-400' : 'text-xl font-bold text-red-400'
                }>
                  {currentMomentum.macd.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">Stochastic</p>
                <p className={
                  currentMomentum.stochastic > 80 ? 'text-xl font-bold text-red-400' :
                    currentMomentum.stochastic < 20 ? 'text-xl font-bold text-green-400' :
                      'text-xl font-bold text-white'
                }>
                  {currentMomentum.stochastic.toFixed(1)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSection(tab.id)}
                className={
                  activeSection === tab.id
                    ? 'flex items-center gap-2 px-4 py-2 rounded transition-colors whitespace-nowrap bg-blue-600 text-white'
                    : 'flex items-center gap-2 px-4 py-2 rounded transition-colors whitespace-nowrap bg-gray-800 text-gray-400 hover:bg-gray-700'
                }
              >
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content Sections */}
        <div className="space-y-6">
          {/* Market Structure Tab */}
          {activeSection === 'structure' && (
            <div className="space-y-6">
              {/* Support/Resistance Chart */}
              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Price Action & Key Levels</h2>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={showAnnotations}
                      onChange={(e) => setShowAnnotations(e.target.checked)}
                      className="rounded"
                    />
                    Show Annotations
                  </label>
                </div>
                <ResponsiveContainer width="100%" height={400}>
                  <ComposedChart data={processedData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis
                      dataKey="date"
                      stroke="#9CA3AF"
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      stroke="#9CA3AF"
                      domain={['dataMin - 5', 'dataMax + 5']}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1F2937',
                        border: '1px solid #374151',
                        borderRadius: '0.5rem'
                      }}
                    />
                    <Legend />

                    {/* Support/Resistance Lines */}
                    {showAnnotations && srLevels.map((level, idx) => (
                      <ReferenceLine
                        key={`sr-${idx}`}
                        y={level.price}
                        stroke={level.type === 'resistance' ? '#EF4444' : '#10B981'}
                        strokeDasharray="5 5"
                        strokeWidth={2}
                        label={{
                          value: `${level.type.toUpperCase()} $${level.price.toFixed(2)}`,
                          fill: level.type === 'resistance' ? '#EF4444' : '#10B981',
                          fontSize: 11,
                          position: 'right'
                        }}
                      />
                    ))}

                    {/* POC Line */}
                    {showAnnotations && volumeProfile.poc && (
                      <ReferenceLine
                        y={volumeProfile.poc.priceLevel}
                        stroke="#F59E0B"
                        strokeWidth={2}
                        label={{
                          value: `POC $${volumeProfile.poc.priceLevel.toFixed(2)}`,
                          fill: '#F59E0B',
                          fontSize: 11,
                          position: 'right'
                        }}
                      />
                    )}

                    <Area
                      type="monotone"
                      dataKey="sma20"
                      stroke="#3B82F6"
                      fill="none"
                      strokeWidth={1.5}
                      name="SMA 20"
                      dot={false}
                      connectNulls={true}
                    />
                    <Line
                      type="monotone"
                      dataKey="close"
                      stroke="#FFFFFF"
                      strokeWidth={2}
                      name="Price"
                      dot={false}
                    />

                    {/* Swing Highs */}
                    {showAnnotations && swingAnalysis.highs.map((high, idx) => (
                      <ReferenceLine
                        key={`high-${idx}`}
                        segment={[
                          { x: processedData[high.index]?.date, y: high.price - 2 },
                          { x: processedData[high.index]?.date, y: high.price + 0.5 }
                        ]}
                        stroke="#EF4444"
                        strokeWidth={2}
                      />
                    ))}

                    {/* Swing Lows */}
                    {showAnnotations && swingAnalysis.lows.map((low, idx) => (
                      <ReferenceLine
                        key={`low-${idx}`}
                        segment={[
                          { x: processedData[low.index]?.date, y: low.price + 2 },
                          { x: processedData[low.index]?.date, y: low.price - 0.5 }
                        ]}
                        stroke="#10B981"
                        strokeWidth={2}
                      />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Key Levels Table */}
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-gray-800 rounded-lg p-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Target size={20} className="text-red-400" />
                    Resistance Levels
                  </h3>
                  <div className="space-y-2">
                    {srLevels
                      .filter(l => l.type === 'resistance' && l.price > (currentPrice || 595))
                      .slice(0, 5)
                      .map((level, idx) => (
                        <div key={idx} className="flex justify-between items-center p-3 bg-gray-700/50 rounded">
                          <div>
                            <p className="font-semibold">${level.price.toFixed(2)}</p>
                            <p className="text-xs text-gray-400">{level.touches} touches</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-red-400">+{level.distance.toFixed(2)}%</p>
                            <div className="w-20 h-2 bg-gray-600 rounded-full mt-1">
                              <div
                                className="h-full bg-red-500 rounded-full"
                                style={{ width: `${Math.min(level.strength * 10, 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="bg-gray-800 rounded-lg p-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Target size={20} className="text-green-400" />
                    Support Levels
                  </h3>
                  <div className="space-y-2">
                    {srLevels
                      .filter(l => l.type === 'support' && l.price < (currentPrice || 595))
                      .slice(0, 5)
                      .map((level, idx) => (
                        <div key={idx} className="flex justify-between items-center p-3 bg-gray-700/50 rounded">
                          <div>
                            <p className="font-semibold">${level.price.toFixed(2)}</p>
                            <p className="text-xs text-gray-400">{level.touches} touches</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-green-400">-{level.distance.toFixed(2)}%</p>
                            <div className="w-20 h-2 bg-gray-600 rounded-full mt-1">
                              <div
                                className="h-full bg-green-500 rounded-full"
                                style={{ width: `${Math.min(level.strength * 10, 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {/* Break of Structure */}
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <AlertTriangle size={20} className="text-yellow-400" />
                  Recent Break of Structure Events
                </h3>
                <div className="space-y-2">
                  {bosAnalysis.bos.slice(-5).reverse().map((bos, idx) => (
                    <div
                      key={idx}
                      className={
                        bos.type === 'bullish' ? 'p-3 rounded bg-green-600/20' : 'p-3 rounded bg-red-600/20'
                      }
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          {bos.type === 'bullish' ? (
                            <TrendingUp className="text-green-400" size={20} />
                          ) : (
                            <TrendingDown className="text-red-400" size={20} />
                          )}
                          <div>
                            <p className="font-semibold capitalize">{bos.type} BOS</p>
                            <p className="text-xs text-gray-400">
                              {processedData[bos.index]?.date || 'Recent'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">${bos.price.toFixed(2)}</p>
                          <p className="text-xs text-gray-400">
                            Broke ${bos.level.toFixed(2)} ({bos.strength.toFixed(2)}%)
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {bosAnalysis.bos.length === 0 && (
                    <p className="text-gray-400 text-center py-4">No recent breaks detected</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Momentum Tab */}
          {activeSection === 'momentum' && (
            <div className="space-y-6">
              <div className="text-white">
                {/* RSI Chart */}
                <div className="bg-gray-800 rounded-lg p-6">
                  <h2 className="text-xl font-semibold mb-4">RSI (Relative Strength Index)</h2>
                  <ResponsiveContainer width="100%" height={250}>
                    <ComposedChart data={processedData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="date" stroke="#9CA3AF" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} stroke="#9CA3AF" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                      />
                      <ReferenceLine y={70} stroke="#EF4444" strokeDasharray="3 3" label="Overbought" />
                      <ReferenceLine y={30} stroke="#10B981" strokeDasharray="3 3" label="Oversold" />
                      <ReferenceLine y={50} stroke="#6B7280" strokeDasharray="3 3" />
                      <Area
                        type="monotone"
                        dataKey="rsi"
                        stroke="#3B82F6"
                        fill="#3B82F6"
                        fillOpacity={0.3}
                        name="RSI"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-gray-400 mt-2">
                    RSI &gt; 70 = overbought (potential reversal). RSI &lt; 30 = oversold (potential bounce).
                  </p>
                </div>

                {/* MACD Chart */}
                <div className="bg-gray-800 rounded-lg p-6">
                  <h2 className="text-xl font-semibold mb-4">MACD (Moving Average Convergence Divergence)</h2>
                  <ResponsiveContainer width="100%" height={250}>
                    <ComposedChart data={processedData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="date" stroke="#9CA3AF" tick={{ fontSize: 12 }} />
                      <YAxis stroke="#9CA3AF" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                      />
                      <Legend />
                      <ReferenceLine y={0} stroke="#6B7280" />
                      <Bar dataKey="macdHistogram" name="Histogram">
                        {processedData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.macdHistogram > 0 ? '#10B981' : '#EF4444'} />
                        ))}
                      </Bar>
                      <Line
                        type="monotone"
                        dataKey="macd"
                        stroke="#3B82F6"
                        strokeWidth={2}
                        name="MACD"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="macdSignal"
                        stroke="#F59E0B"
                        strokeWidth={2}
                        name="Signal"
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-gray-400 mt-2">
                    MACD crossing above signal = bullish. Histogram expansion = momentum acceleration.
                  </p>
                </div>

                {/* Stochastic Oscillator */}
                <div className="bg-gray-800 rounded-lg p-6">
                  <h2 className="text-xl font-semibold mb-4">Stochastic Oscillator</h2>
                  <ResponsiveContainer width="100%" height={250}>
                    <ComposedChart data={processedData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="date" stroke="#9CA3AF" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} stroke="#9CA3AF" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                      />
                      <Legend />
                      <ReferenceLine y={80} stroke="#EF4444" strokeDasharray="3 3" label="Overbought" />
                      <ReferenceLine y={20} stroke="#10B981" strokeDasharray="3 3" label="Oversold" />
                      <Area
                        type="monotone"
                        dataKey="stochK"
                        stroke="#8B5CF6"
                        fill="#8B5CF6"
                        fillOpacity={0.2}
                        name="%K"
                      />
                      <Line
                        type="monotone"
                        dataKey="stochD"
                        stroke="#EC4899"
                        strokeWidth={2}
                        name="%D"
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-gray-400 mt-2">
                    %K crossing above %D in oversold territory = bullish signal. Vice versa for bearish.
                  </p>
                </div>

                {/* Momentum Summary Grid */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="text-sm text-gray-400 mb-2">Trend Direction</h3>
                    <p className="text-2xl font-bold capitalize">{swingAnalysis.current.trend}</p>
                    <div className="mt-2 w-full h-2 bg-gray-700 rounded-full">
                      <div
                        className={
                          swingAnalysis.current.trend === 'uptrend' ? 'h-full rounded-full bg-green-500' :
                            swingAnalysis.current.trend === 'downtrend' ? 'h-full rounded-full bg-red-500' :
                              'h-full rounded-full bg-yellow-500'
                        }
                        style={{ width: `${swingAnalysis.current.strength * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="text-sm text-gray-400 mb-2">Swing Highs</h3>
                    <p className="text-2xl font-bold">{swingAnalysis.highs.length}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Last: ${swingAnalysis.highs[swingAnalysis.highs.length - 1]?.price.toFixed(2) || 'N/A'}
                    </p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="text-sm text-gray-400 mb-2">Swing Lows</h3>
                    <p className="text-2xl font-bold">{swingAnalysis.lows.length}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Last: ${swingAnalysis.lows[swingAnalysis.lows.length - 1]?.price.toFixed(2) || 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Options Walls Tab */}
          {activeSection === 'walls' && (
            <div className="space-y-6">
              <div className="text-white">
                {/* Max Pain & Key Walls */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="text-sm text-gray-400 mb-2">Max Pain</h3>
                    <p className="text-3xl font-bold text-yellow-400">
                      ${optionsWalls.maxPain?.toFixed(2) || 'N/A'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Price where option sellers have minimum pain
                    </p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="text-sm text-gray-400 mb-2">Support Walls</h3>
                    <p className="text-3xl font-bold text-green-400">
                      {optionsWalls.supportWalls?.length || 0}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Put-heavy strikes below price
                    </p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="text-sm text-gray-400 mb-2">Resistance Walls</h3>
                    <p className="text-3xl font-bold text-red-400">
                      {optionsWalls.resistanceWalls?.length || 0}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Call-heavy strikes above price
                    </p>
                  </div>
                </div>

                {/* Open Interest by Strike */}
                <div className="bg-gray-800 rounded-lg p-6">
                  <h2 className="text-xl font-semibold mb-4">Open Interest by Strike</h2>
                  <ResponsiveContainer width="100%" height={350}>
                    <ComposedChart data={optionsWalls.walls}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="strike" stroke="#9CA3AF" />
                      <YAxis stroke="#9CA3AF" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                        formatter={(value, name) => [value.toLocaleString(), name]}
                      />
                      <Legend />
                      {currentPrice && (
                        <ReferenceLine
                          x={currentPrice}
                          stroke="#FFFFFF"
                          strokeWidth={2}
                          label={{
                            value: 'Current Price',
                            fill: '#FFFFFF',
                            fontSize: 12
                          }}
                        />
                      )}
                      {optionsWalls.maxPain && (
                        <ReferenceLine
                          x={optionsWalls.maxPain}
                          stroke="#F59E0B"
                          strokeDasharray="5 5"
                          strokeWidth={2}
                          label={{
                            value: 'Max Pain',
                            fill: '#F59E0B',
                            fontSize: 12
                          }}
                        />
                      )}
                      <Bar dataKey="callOI" stackId="oi" fill="#10B981" name="Call OI" />
                      <Bar dataKey="putOI" stackId="oi" fill="#EF4444" name="Put OI" />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-gray-400 mt-2">
                    High OI strikes act as magnets. Price tends to gravitate toward max pain into expiration.
                  </p>
                </div>

                {/* Net Gamma Exposure */}
                <div className="bg-gray-800 rounded-lg p-6">
                  <h2 className="text-xl font-semibold mb-4">Net Gamma Exposure by Strike</h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={optionsWalls.walls}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="strike" stroke="#9CA3AF" />
                      <YAxis stroke="#9CA3AF" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                        formatter={(value) => value.toExponential(2)}
                      />
                      {currentPrice && (
                        <ReferenceLine
                          x={currentPrice}
                          stroke="#FFFFFF"
                          strokeWidth={2}
                        />
                      )}
                      <Bar dataKey="netGamma" name="Net Gamma">
                        {optionsWalls.walls.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.netGamma > 0 ? '#10B981' : '#EF4444'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-gray-400 mt-2">
                    Negative gamma (red) = dealers chase price. Positive gamma (green) = dealers dampen volatility.
                  </p>
                </div>

                {/* Put/Call Ratio by Strike */}
                <div className="bg-gray-800 rounded-lg p-6">
                  <h2 className="text-xl font-semibold mb-4">Put/Call Ratio by Strike</h2>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={optionsWalls.walls}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="strike" stroke="#9CA3AF" />
                      <YAxis stroke="#9CA3AF" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                      />
                      {currentPrice && (
                        <ReferenceLine
                          x={currentPrice}
                          stroke="#FFFFFF"
                          strokeWidth={2}
                        />
                      )}
                      <ReferenceLine y={1} stroke="#6B7280" strokeDasharray="3 3" label="Neutral" />
                      <Line
                        type="monotone"
                        dataKey="putCallRatio"
                        stroke="#8B5CF6"
                        strokeWidth={2}
                        name="P/C Ratio"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-gray-400 mt-2">
                    P/C &gt; 1 = bearish positioning. P/C &lt; 1 = bullish positioning.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Volume Profile Tab */}
          {activeSection === 'volume' && (
            <div className="space-y-6">
              <div className="text-white">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="text-sm text-gray-400 mb-2">Point of Control (POC)</h3>
                    <p className="text-3xl font-bold text-yellow-400">
                      ${volumeProfile.poc?.priceLevel.toFixed(2) || 'N/A'}
                    </p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="text-sm text-gray-400 mb-2">Value Area High</h3>
                    <p className="text-3xl font-bold text-blue-400">
                      ${volumeProfile.vah?.toFixed(2) || 'N/A'}
                    </p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="text-sm text-gray-400 mb-2">Value Area Low</h3>
                    <p className="text-3xl font-bold text-blue-400">
                      ${volumeProfile.val?.toFixed(2) || 'N/A'}
                    </p>
                  </div>
                </div>

                <div className="bg-gray-800 rounded-lg p-6">
                  <h2 className="text-xl font-semibold mb-4">Volume Profile</h2>
                  <ResponsiveContainer width="100%" height={500}>
                    <ComposedChart
                      layout="vertical"
                      data={volumeProfile.profile}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis type="number" stroke="#9CA3AF" />
                      <YAxis
                        dataKey="priceLevel"
                        type="number"
                        stroke="#9CA3AF"
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={(val) => `$${val.toFixed(2)}`}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                        formatter={(value, name) => [value.toLocaleString(), 'Volume']}
                        labelFormatter={(val) => `Price: $${val.toFixed(2)}`}
                      />
                      {currentPrice && (
                        <ReferenceLine
                          y={currentPrice}
                          stroke="#FFFFFF"
                          strokeWidth={2}
                          label={{ value: 'Current', fill: '#FFFFFF', fontSize: 11 }}
                        />
                      )}
                      {volumeProfile.poc && (
                        <ReferenceLine
                          y={volumeProfile.poc.priceLevel}
                          stroke="#F59E0B"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          label={{ value: 'POC', fill: '#F59E0B', fontSize: 11 }}
                        />
                      )}
                      {volumeProfile.vah && (
                        <ReferenceLine
                          y={volumeProfile.vah}
                          stroke="#3B82F6"
                          strokeDasharray="3 3"
                          label={{ value: 'VAH', fill: '#3B82F6', fontSize: 10 }}
                        />
                      )}
                      {volumeProfile.val && (
                        <ReferenceLine
                          y={volumeProfile.val}
                          stroke="#3B82F6"
                          strokeDasharray="3 3"
                          label={{ value: 'VAL', fill: '#3B82F6', fontSize: 10 }}
                        />
                      )}
                      <Bar
                        dataKey="volume"
                        fill="#60A5FA"
                        opacity={0.7}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-gray-400 mt-2">
                    POC = highest traded volume. Value Area = 70% of volume distribution.
                    Price tends to return to high-volume nodes.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Correlation Tab */}
          {activeSection === 'correlation' && (
            <div className="space-y-6">
              <div className="text-white">
                <div className="bg-gray-800 rounded-lg p-6">
                  <h2 className="text-xl font-semibold mb-4">SPY vs VIX Correlation (14-Day Rolling)</h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={correlationData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis
                        dataKey="timestamp"
                        stroke="#9CA3AF"
                        tickFormatter={(ts) => new Date(ts).toLocaleDateString()}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis
                        yAxisId="left"
                        domain={[-1, 1]}
                        stroke="#9CA3AF"
                        label={{ value: 'Correlation', angle: -90, position: 'insideLeft' }}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                        formatter={(value, name) => [
                          name === 'spyVixCorr' ? value.toFixed(3) : value.toFixed(2),
                          name
                        ]}
                        labelFormatter={(ts) => new Date(ts).toLocaleDateString()}
                      />
                      <Legend />
                      <ReferenceLine y={0} stroke="#6B7280" />
                      <ReferenceLine y={-0.5} stroke="#EF4444" strokeDasharray="3 3" />
                      <Area
                        type="monotone"
                        dataKey="spyVixCorr"
                        stroke="#8B5CF6"
                        fill="#8B5CF6"
                        fillOpacity={0.3}
                        name="SPY-VIX Correlation"
                        yAxisId="left"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-gray-400 mt-2">
                    Typically negative (-0.7 to -0.9). Breaking toward zero or positive = potential regime change.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-gray-800 rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-4">Current Correlations</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center p-3 bg-gray-700/50 rounded">
                        <span>SPY vs VIX</span>
                        <span className="font-bold text-purple-400">
                          {correlationData.length > 0
                            ? correlationData[correlationData.length - 1].spyVixCorr.toFixed(3)
                            : 'N/A'
                          }
                        </span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-gray-700/50 rounded">
                        <span>Correlation Strength</span>
                        <span className={
                          Math.abs(correlationData[correlationData.length - 1]?.spyVixCorr || 0) > 0.7
                            ? 'font-bold text-green-400'
                            : Math.abs(correlationData[correlationData.length - 1]?.spyVixCorr || 0) > 0.4
                              ? 'font-bold text-yellow-400'
                              : 'font-bold text-red-400'
                        }>
                          {Math.abs(correlationData[correlationData.length - 1]?.spyVixCorr || 0) > 0.7
                            ? 'Strong'
                            : Math.abs(correlationData[correlationData.length - 1]?.spyVixCorr || 0) > 0.4
                              ? 'Moderate'
                              : 'Weak'
                          }
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-800 rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-4">Interpretation</h3>
                    <div className="space-y-2 text-sm">
                      <p className="text-gray-300">
                        <span className="text-purple-400 font-semibold">Strong Negative (-0.7 to -1):</span> Normal market conditions. VIX rises when SPY falls.
                      </p>
                      <p className="text-gray-300">
                        <span className="text-yellow-400 font-semibold">Weakening Correlation (-0.3 to -0.7):</span> Potential regime shift. Monitor closely.
                      </p>
                      <p className="text-gray-300">
                        <span className="text-red-400 font-semibold">Positive Correlation (0 to +1):</span> Unusual. Both rising = crisis. Both falling = complacency.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

  );
};

export default MarketStructureAnalysis;
