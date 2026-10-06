/**
 * RAL kleuren database — meestgebruikte kleuren in de kozijnindustrie.
 */
export const RAL_COLORS = [
  { code: "RAL9010", name: "Pure white", hex: "#F1ECE1" },
  { code: "RAL9001", name: "Cream", hex: "#F0EDE3" },
  { code: "RAL9016", name: "Traffic white", hex: "#F7F9EF" },
  { code: "RAL7016", name: "Anthracite grey", hex: "#383E42" },
  { code: "RAL9005", name: "Jet black", hex: "#0E0E10" },
  { code: "RAL7021", name: "Black grey", hex: "#2F3234" },
  { code: "RAL7035", name: "Light grey", hex: "#C5C7C4" },
  { code: "RAL7039", name: "Quartz grey", hex: "#6B6B60" },
  { code: "RAL8014", name: "Sepia brown", hex: "#49392D" },
  { code: "RAL8003", name: "Clay brown", hex: "#7E4B26" },
  { code: "RAL6009", name: "Fir green", hex: "#1F3A28" },
  { code: "RAL6005", name: "Moss green", hex: "#1E3B2B" },
  { code: "RAL5011", name: "Steel blue", hex: "#1A2B3C" },
  { code: "RAL3005", name: "Wine red", hex: "#5E2028" },
  { code: "RAL1015", name: "Light ivory", hex: "#E3D4B5" },
  { code: "RAL7022", name: "Umbra grey", hex: "#4B4D46" },
  { code: "RAL9007", name: "Grey aluminum", hex: "#8C8C7E" },
  { code: "RAL9006", name: "White aluminum", hex: "#A1A1A0" },
  { code: "RAL8022", name: "Black brown", hex: "#1A1718" },
  { code: "RAL7015", name: "Slate grey", hex: "#4D5258" },
];

export function ralToHex(code) {
  const color = RAL_COLORS.find(c => c.code === code);
  return color ? color.hex : "#CCCCCC";
}
