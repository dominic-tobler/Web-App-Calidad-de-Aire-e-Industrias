import { EMISSION_SOURCE_OPTIONS } from "../data/industries"
import { POLLUTANTS, type Pollutant } from "../domain/airQuality"
import { PollutantTip } from "./PollutantTip"
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
        options={POLLUTANTS.map((item) => ({
          id: item.id,
          label: item.label,
          hint: item.plain,
        }))}
        aside={<PollutantTip pollutant={pollutant} />}
        onChange={(id) => onPollutant(id as Pollutant)}
      />
    </div>
  )
}
