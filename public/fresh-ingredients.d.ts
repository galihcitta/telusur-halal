interface FreshPlantInput {
  declared_name: string;
  form: string;
  no_additives?: boolean;
  pack_condition: string;
  conflict?: boolean;
  brand?: string;
  variant?: string | null;
}
export function freshPlantCandidate(ingredient: FreshPlantInput): boolean;
export function freshPlantAssumption(ingredient: FreshPlantInput): boolean;
