import rawIndustries from "../../Data/industries.json"
import { normalizeIndustry, type Industry } from "../domain/industry"

export const industries: Industry[] = rawIndustries.map((row) => normalizeIndustry(row))
