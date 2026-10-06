/** Cross-section resistance only: a flat steel plate with all elements connected.
 * Net area must already include the governing hole deductions. U = 1 for AISC.
 * Connections, block shear, shear lag, fatigue, bending and load generation are
 * deliberately outside this calculation; a capacity result is not a member approval.
 */
export type SteelTensionMethod = 'IN-IS800-2007' | 'US-AISC360-22-LRFD' | 'US-AISC360-22-ASD' | 'UK-EC3-2005-NA2014';
export interface SteelTensionInput {
  method: SteelTensionMethod;
  grossAreaMm2: number;
  netAreaMm2: number;
  yieldStrengthMPa: number;
  ultimateStrengthMPa: number;
  requiredTensionKN: number;
}
export const STEEL_TENSION_METHODS = {
  'IN-IS800-2007': {
    name: 'India — IS 800:2007 (limit state)',
    edition: 'IS 800:2007, third revision',
    clauses: '6.2, 6.3.1; Table 5',
    forceBasis: 'Factored design tension from the applicable Indian load combinations',
    yieldFactor: 1 / 1.10,
    ruptureFactor: 0.90 / 1.25,
    factors: 'gamma_m0 = 1.10; gamma_m1 = 1.25; plate rupture coefficient = 0.90',
    source: 'https://standards.bis.gov.in/',
    review: 'Independent arithmetic references checked; external engineering review pending.',
  },
  'US-AISC360-22-LRFD': {
    name: 'US — ANSI/AISC 360-22 (LRFD)',
    edition: 'ANSI/AISC 360-22',
    clauses: 'D2(a), D2(b); D3 for effective net area',
    forceBasis: 'Required strength from LRFD load combinations; enter factored tension',
    yieldFactor: 0.90,
    ruptureFactor: 0.75,
    factors: 'phi_y = 0.90; phi_r = 0.75; U = 1.00 for the supported fully connected plate',
    source: 'https://www.aisc.org/aisc/publications/current-standards/aisc-360/',
    review: 'Independent arithmetic references checked. September 2026 errata content and external engineering review pending.',
  },
  'US-AISC360-22-ASD': {
    name: 'US — ANSI/AISC 360-22 (ASD)',
    edition: 'ANSI/AISC 360-22',
    clauses: 'D2(a), D2(b); D3 for effective net area',
    forceBasis: 'Required strength from ASD load combinations; do not enter LRFD factored tension',
    yieldFactor: 1 / 1.67,
    ruptureFactor: 1 / 2.00,
    factors: 'Omega_y = 1.67; Omega_r = 2.00; U = 1.00 for the supported fully connected plate',
    source: 'https://www.aisc.org/aisc/publications/current-standards/aisc-360/',
    review: 'Independent arithmetic references checked. September 2026 errata content and external engineering review pending.',
  },
  'UK-EC3-2005-NA2014': {
    name: 'UK — BS EN 1993-1-1:2005+A1:2014 + UK NA',
    edition: 'BS EN 1993-1-1:2005+A1:2014; NA+A1:2014 (first generation)',
    clauses: '6.2.3(2), expressions 6.6 and 6.7; UK NA partial factors',
    forceBasis: 'Design tension N_Ed from first-generation Eurocode load combinations with the matching UK annex',
    yieldFactor: 1.00,
    ruptureFactor: 0.90 / 1.10,
    factors: 'gamma_M0 = 1.00; gamma_M2 = 1.10 for cross-section tension fracture',
    source: 'https://steelconstruction.info/topics/design/member-design',
    review: 'Independent arithmetic references checked; external engineering review pending. Second-generation Eurocodes are not implemented.',
  },
} as const;

export interface SteelTensionResult {
  schema: 'spanvision.steel-tension.v1';
  input: SteelTensionInput;
  standard: typeof STEEL_TENSION_METHODS[SteelTensionMethod];
  yieldingCapacityKN: number;
  ruptureCapacityKN: number;
  sectionCapacityKN: number;
  governingLimitState: 'gross-section yielding' | 'net-section rupture' | 'both';
  utilization: number;
  sectionWithinCapacity: boolean;
  completeMemberVerification: false;
  scope: string;
  excludedChecks: readonly string[];
}

export function calculateSteelTension(input: SteelTensionInput): SteelTensionResult {
  if (!input || typeof input !== 'object' || !Object.prototype.hasOwnProperty.call(STEEL_TENSION_METHODS, input.method)) throw new Error('Unsupported steel tension method.');
  const numbers = [input.grossAreaMm2, input.netAreaMm2, input.yieldStrengthMPa, input.ultimateStrengthMPa, input.requiredTensionKN];
  if (numbers.some((n) => typeof n !== 'number' || !Number.isFinite(n))) throw new Error('All steel tension inputs must be finite numbers.');
  if (input.grossAreaMm2 <= 0 || input.netAreaMm2 <= 0) throw new Error('Gross and net areas must be greater than zero.');
  if (input.netAreaMm2 > input.grossAreaMm2) throw new Error('Net area cannot exceed gross area.');
  // This implementation is for ordinary structural steel, not arbitrary materials.
  if (input.yieldStrengthMPa < 100 || input.yieldStrengthMPa > 700 || input.ultimateStrengthMPa > 1000 || input.ultimateStrengthMPa < input.yieldStrengthMPa) {
    throw new Error('Supported steel strength range: 100 <= fy <= 700 MPa and fy <= fu <= 1000 MPa.');
  }
  if (input.requiredTensionKN < 0) throw new Error('Required tension must be zero or positive; compression is outside this module.');
  const standard = STEEL_TENSION_METHODS[input.method];
  const yieldingCapacityKN = input.grossAreaMm2 * input.yieldStrengthMPa * standard.yieldFactor / 1000;
  const ruptureCapacityKN = input.netAreaMm2 * input.ultimateStrengthMPa * standard.ruptureFactor / 1000;
  const sectionCapacityKN = Math.min(yieldingCapacityKN, ruptureCapacityKN);
  const utilization = input.requiredTensionKN / sectionCapacityKN;
  if (![yieldingCapacityKN, ruptureCapacityKN, sectionCapacityKN, utilization].every(Number.isFinite) || sectionCapacityKN <= 0) {
    throw new Error('Inputs exceed the supported numeric range.');
  }
  return {
    schema: 'spanvision.steel-tension.v1', input: { ...input }, standard,
    yieldingCapacityKN, ruptureCapacityKN, sectionCapacityKN,
    governingLimitState: yieldingCapacityKN === ruptureCapacityKN ? 'both' : yieldingCapacityKN < ruptureCapacityKN ? 'gross-section yielding' : 'net-section rupture',
    utilization, sectionWithinCapacity: utilization <= 1, completeMemberVerification: false,
    scope: 'Gross-section yielding and net-section rupture of a flat plate under concentric axial tension, with all elements connected.',
    excludedChecks: ['connection and block shear', 'shear lag and partially connected sections', 'UK Category C slip-resistant connections', 'fatigue and fracture toughness', 'bending and compression', 'load combinations and geolocation loads', 'serviceability and slenderness', 'fire and seismic detailing'],
  };
}

/** Numeric IDs are local to this sheet; no project-wide code selector is implied. */
export const STEEL_TENSION_METHOD_IDS: Record<number, SteelTensionMethod> = {
  1: 'IN-IS800-2007', 2: 'US-AISC360-22-LRFD', 3: 'US-AISC360-22-ASD', 4: 'UK-EC3-2005-NA2014',
};

export function steelTensionFromNumbers(method: number, grossAreaMm2: number, netAreaMm2: number, yieldStrengthMPa: number, ultimateStrengthMPa: number, requiredTensionKN: number): SteelTensionResult {
  return calculateSteelTension({ method: STEEL_TENSION_METHOD_IDS[method], grossAreaMm2, netAreaMm2, yieldStrengthMPa, ultimateStrengthMPa, requiredTensionKN });
}
