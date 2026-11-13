import { POLLUTANTS, type Pollutant } from "../domain/airQuality"
import { SOURCE_OPTIONS, type SourceCategory } from "../domain/industry"
import { SelectMenu } from "./SelectMenu"

type EmissionFiltersProps = {
  source: SourceCategory
  pollutant: Pollutant
  onSource: (source: SourceCategory) => void
  onPollutant: (pollutant: Pollutant) => void
}

export function EmissionFilters({
  source,
  pollutant,
  onSource,
  onPollutant,
}: EmissionFiltersProps) {
  return (
    <div className="filter-stack">
      <SelectMenu
        label="Fuente de emisión"
        value={source}
        options={SOURCE_OPTIONS}
        onChange={(id) => onSource(id as SourceCategory)}
      />
      <SelectMenu
        label="Tipo de emisión"
        value={pollutant}
        options={POLLUTANTS}
        onChange={(id) => onPollutant(id as Pollutant)}
      />
    </div>
  )
}
