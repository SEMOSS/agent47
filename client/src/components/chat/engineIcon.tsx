import type { ComponentType } from "react";
import {
  SiAnthropic,
  SiGoogle,
  SiGooglecloud,
  SiGooglegemini,
  SiHuggingface,
  SiMeta,
  SiOpenai,
  SiPostgresql,
} from "react-icons/si";
import { FaAws } from "react-icons/fa";
import { Brain, Database, HardDrive, Layers } from "lucide-react";
import type { EngineCategory } from "@/store/slices/enginesSlice";

type IconComponent = ComponentType<{ className?: string }>;

const SUBTYPE_ICON_MAP: Record<string, IconComponent> = {
  BEDROCK: FaAws,
  VERTEX: SiGooglecloud,
  GEMINI: SiGooglegemini,
  OPEN_AI: SiOpenai,
  ANTHROPIC: SiAnthropic,
  GOOGLE_GEMINI: SiGooglegemini,
  GOOGLE: SiGoogle,
  HUGGINGFACE: SiHuggingface,
  POSTGRES: SiPostgresql,
  POSTGRESQL: SiPostgresql,
  GOOGLE_CLOUD_NATIVE_STORAGE: SiGooglecloud,
  FAISS: SiMeta,
};

const CATEGORY_FALLBACK: Record<EngineCategory, IconComponent> = {
  MODEL: Brain,
  DATABASE: Database,
  STORAGE: HardDrive,
  VECTOR: Layers,
};

export const getEngineIcon = (
  subtype: string | undefined,
  category: EngineCategory,
): IconComponent => {
  if (subtype) {
    const direct = SUBTYPE_ICON_MAP[subtype];
    if (direct) return direct;
  }
  return CATEGORY_FALLBACK[category];
};

export const getCategoryIcon = (category: EngineCategory): IconComponent =>
  CATEGORY_FALLBACK[category];
