export function calculateMaximumChargeQuantity(
  capacity: number,
  volume: number
) {
  const ratio = capacity / volume;
  const floatingPointTolerance =
    Number.EPSILON * Math.max(1, Math.abs(ratio)) * 8;

  return Math.floor(ratio + floatingPointTolerance);
}

export function isChargeSizeCompatible(
  moduleChargeSize: number | null,
  chargeSize: number | null
) {
  return moduleChargeSize === null || moduleChargeSize === (chargeSize ?? 0);
}
