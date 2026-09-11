/**
 * 体积重引擎。纯函数。
 * 体积重 = 长 × 宽 × 高 ÷ 除数（cm，结果 kg）；计费重取体积重与实重的较大者。
 *
 * ⚠ 现状：本文件已**不被任何页面引用** —— 计费重工具走的是 crossborder/dim-weight-rules.ts
 * （含承运商规则表、尺寸取整、进位与最低计费重、包装方案对比）。这里只剩测试在用。
 * 新代码一律用 dim-weight-rules.ts；不要从这里复制公式。
 */

export type DimWeightInput = {
  length: number;
  width: number;
  height: number;
  actual: number;
  divisor: number;
};

export type DimWeightResult = {
  volumetric: number;
  chargeable: number;
  useVolumetric: boolean;
};

export function calculateDimWeight(input: DimWeightInput): DimWeightResult {
  const volumetric = input.divisor > 0
    ? (input.length * input.width * input.height) / input.divisor
    : 0;
  const chargeable = Math.max(input.actual, volumetric);
  return { volumetric, chargeable, useVolumetric: volumetric > input.actual };
}
