// calculator.js — Water change volume & Seachem Prime dosage calculations

const Calculator = (() => {
  /**
   * Calculate volume of water removed based on rim-to-water measurements.
   * @param {number} lengthCm - Tank internal length in cm
   * @param {number} widthCm  - Tank internal width in cm
   * @param {number} beforeCm - Rim-to-water distance BEFORE draining (cm)
   * @param {number} afterCm  - Rim-to-water distance AFTER draining (cm)
   * @returns {number} Volume removed in litres
   */
  function volumeRemoved(lengthCm, widthCm, beforeCm, afterCm) {
    const dropCm = afterCm - beforeCm;
    if (dropCm <= 0) return 0;
    return (lengthCm * widthCm * dropCm) / 1000;
  }

  /**
   * Calculate total tank water volume from dimensions and current water level.
   * @param {number} lengthCm
   * @param {number} widthCm
   * @param {number} heightCm   - Tank internal height in cm
   * @param {number} rimGapCm   - Current rim-to-water distance (0 = filled to brim)
   * @returns {number} Current water volume in litres
   */
  function currentVolume(lengthCm, widthCm, heightCm, rimGapCm = 0) {
    const waterHeight = heightCm - rimGapCm;
    if (waterHeight <= 0) return 0;
    return (lengthCm * widthCm * waterHeight) / 1000;
  }

  /**
   * Calculate max tank volume (filled to brim).
   */
  function maxVolume(lengthCm, widthCm, heightCm) {
    return (lengthCm * widthCm * heightCm) / 1000;
  }

  /**
   * Calculate Seachem Prime dose for new water.
   * Standard: 5 mL per 200 L. Rounds to nearest 0.5 mL.
   * @param {number} litres     - Volume of new water
   * @param {number} mlPer200L  - Prime concentration (default 5)
   * @returns {number} Prime dose in mL, rounded to 0.5
   */
  function primeDose(litres, mlPer200L = 5) {
    const raw = (litres / 200) * mlPer200L;
    return Math.round(raw * 2) / 2; // round to nearest 0.5
  }

  /**
   * Calculate percentage of tank water changed.
   * @param {number} litresRemoved
   * @param {number} totalLitres - total volume before draining
   * @returns {number} Percentage (0–100)
   */
  function percentChanged(litresRemoved, totalLitres) {
    if (totalLitres <= 0) return 0;
    return (litresRemoved / totalLitres) * 100;
  }

  /**
   * Validate water change inputs.
   * @returns {{ valid: boolean, errors: string[] }}
   */
  function validate(beforeCm, afterCm, tankHeightCm) {
    const errors = [];
    if (beforeCm < 0) errors.push('Before measurement cannot be negative.');
    if (afterCm < 0) errors.push('After measurement cannot be negative.');
    if (beforeCm > tankHeightCm) errors.push('Before measurement exceeds tank height.');
    if (afterCm > tankHeightCm) errors.push('After measurement exceeds tank height.');
    if (afterCm <= beforeCm) errors.push('After measurement must be greater than before (water level dropped).');
    return { valid: errors.length === 0, errors };
  }

  /**
   * Full water change calculation — returns everything the UI needs.
   */
  function calculate(tank, beforeCm, afterCm) {
    const validation = validate(beforeCm, afterCm, tank.heightCm);
    if (!validation.valid) return { valid: false, errors: validation.errors };

    const removed = volumeRemoved(tank.lengthCm, tank.widthCm, beforeCm, afterCm);
    const volBefore = currentVolume(tank.lengthCm, tank.widthCm, tank.heightCm, beforeCm);
    const pct = percentChanged(removed, volBefore);
    const prime = primeDose(removed, tank.primeMlPer200L || 5);
    const warning = pct > 80 ? 'Large water change (>80%). Ensure temperature and parameters match.' : null;

    return {
      valid: true,
      removed: Math.round(removed * 10) / 10,
      percentage: Math.round(pct * 10) / 10,
      primeMl: prime,
      warning
    };
  }

  /**
   * Plan a water change: given a target %, work out how much to drain
   * accounting for evaporation since last fill.
   * @param {object} tank        - Tank settings (with fillMarginCm)
   * @param {number} targetPct   - Desired water change percentage (1–90)
   * @param {number} currentFromRimCm - Current rim-to-water distance
   * @returns {object} Plan results
   */
  function planWaterChange(tank, targetPct, currentFromRimCm) {
    const errors = [];
    if (targetPct < 1 || targetPct > 90) errors.push('Target must be between 1% and 90%.');
    if (currentFromRimCm < 0) errors.push('Current level cannot be negative.');
    if (currentFromRimCm >= tank.heightCm) errors.push('Current level exceeds tank height.');
    if (currentFromRimCm < tank.fillMarginCm) errors.push('Current level is above your fill line — check measurement.');
    if (errors.length) return { valid: false, errors };

    const fillDepth = tank.heightCm - tank.fillMarginCm;
    const fullVol = (tank.lengthCm * tank.widthCm * fillDepth) / 1000;
    const curDepth = tank.heightCm - currentFromRimCm;
    const curVol = (tank.lengthCm * tank.widthCm * curDepth) / 1000;
    const evaporated = fullVol - curVol;

    const targetNewWater = (targetPct / 100) * fullVol;
    const volAfterDrain = fullVol - targetNewWater;
    const drainToDepth = volAfterDrain / (tank.lengthCm * tank.widthCm / 1000);
    const drainToFromRim = tank.heightCm - drainToDepth;

    const noDrainNeeded = curVol <= volAfterDrain;
    const volumeToDrain = noDrainNeeded ? 0 : curVol - volAfterDrain;

    const prime = primeDose(targetNewWater, tank.primeMlPer200L || 5);

    const warning = targetPct > 60
      ? 'Large water change (>60%). Ensure temperature and parameters match.'
      : null;

    return {
      valid: true,
      noDrainNeeded,
      evaporated:    Math.round(evaporated * 10) / 10,
      volumeToDrain: Math.round(volumeToDrain * 10) / 10,
      drainToFromRim: Math.round(drainToFromRim * 10) / 10,
      totalNewWater: Math.round(targetNewWater * 10) / 10,
      fullVolume:    Math.round(fullVol * 10) / 10,
      primeMl:       prime,
      percentage:    targetPct,
      warning
    };
  }

  return { volumeRemoved, currentVolume, maxVolume, primeDose, percentChanged, validate, calculate, planWaterChange };
})();
