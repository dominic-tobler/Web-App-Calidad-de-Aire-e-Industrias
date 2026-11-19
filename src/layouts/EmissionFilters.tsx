import { EMISSION_SOURCE_OPTIONS } from "../data/industries"
import { POLLUTANTS, type Pollutant } from "../domain/airQuality"
import { SelectMenu } from "./SelectMenu"

type EmissionFiltersProps = {
  source: string
  pollutant: Pollutant
  onSource: (source: string) => void
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
        options={EMISSION_SOURCE_OPTIONS}
        onChange={onSource}
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
