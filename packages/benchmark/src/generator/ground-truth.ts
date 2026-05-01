export interface GroundTruthEntity {
  entity_type: string;
  value: string;
  start_offset: number;
  end_offset: number;
}

/**
 * Given generated email text and a list of entity values,
 * compute character offsets for each entity in the text.
 * Falls back to -1 offsets if entity value not found in text.
 */
export function computeEntityOffsets(
  text: string,
  entities: { entity_type: string; value: string }[],
): GroundTruthEntity[] {
  const result: GroundTruthEntity[] = [];
  const textLower = text.toLowerCase();

  for (const entity of entities) {
    const valueLower = entity.value.toLowerCase();
    const idx = textLower.indexOf(valueLower);

    if (idx >= 0) {
      result.push({
        entity_type: entity.entity_type,
        value: text.substring(idx, idx + entity.value.length),
        start_offset: idx,
        end_offset: idx + entity.value.length,
      });
    } else {
      // Entity value not found verbatim in text — store without offsets
      result.push({
        entity_type: entity.entity_type,
        value: entity.value,
        start_offset: -1,
        end_offset: -1,
      });
    }
  }

  return result;
}
