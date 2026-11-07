import {
  BookOpen,
  Gift,
  HeartPulse,
  Home,
  PartyPopper,
  Shirt,
  Sprout,
  TreePine,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

// Las campañas no tienen foto on-chain: la portada se genera según el tema de la campaña.
const THEMES: { match: RegExp; icon: LucideIcon; from: string; to: string }[] = [
  { match: /escol|kit|útil|util|cuaderno|colegio|educa|libro|estudi/i, icon: BookOpen, from: "#01417e", to: "#1f60a3" },
  { match: /navidad|navide|diciembre|pesebre/i, icon: TreePine, from: "#04723a", to: "#018d46" },
  { match: /niñ|nin|fiesta|celebr|cumple|día del/i, icon: PartyPopper, from: "#0d4f8f", to: "#1a9757" },
  { match: /comedor|aliment|comida|nutri|mercado|almuerzo|refrigerio/i, icon: UtensilsCrossed, from: "#075a30", to: "#3aa86d" },
  { match: /salud|médic|medic|hospital|vacuna/i, icon: HeartPulse, from: "#062a4f", to: "#1f60a3" },
  { match: /ropa|abrigo|cobija|uniforme/i, icon: Shirt, from: "#033566", to: "#4580bf" },
  { match: /vivienda|casa|techo|hogar/i, icon: Home, from: "#04723a", to: "#1f60a3" },
  { match: /regalo|juguete|donaci/i, icon: Gift, from: "#01417e", to: "#018d46" },
];

export function coverFor(name: string, description = "") {
  const text = `${name} ${description}`;
  return THEMES.find((t) => t.match.test(text)) ?? { icon: Sprout, from: "#01417e", to: "#018d46" };
}
