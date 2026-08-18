export const PHONE_NOTICE =
  'For critical or important info, the organization may call you.'

export const TEAMS = [
  {
    id: 'earthrelay-org',
    label: 'EarthRelay organization',
    short: 'Your org',
  },
  {
    id: 'fire-team',
    label: 'Fire response team',
    short: 'Fire team',
  },
  {
    id: 'water-unit',
    label: 'Water unit',
    short: 'Water',
  },
  {
    id: 'wildlife-unit',
    label: 'Wildlife unit',
    short: 'Wildlife',
  },
]

const ROUTE_MAP = {
  wildfire_smoke: 'fire-team',
  grass_fire: 'fire-team',
  factory_smoke: 'fire-team',
  burning_trash: 'fire-team',
  earthquake: 'fire-team',
  illegal_dumping: 'earthrelay-org',
  plastic_waste: 'earthrelay-org',
  overflowing_garbage: 'earthrelay-org',
  construction_debris: 'earthrelay-org',
  e_waste: 'earthrelay-org',
  tires_dumped: 'earthrelay-org',
  oil_spill: 'earthrelay-org',
  chemical_spill: 'earthrelay-org',
  air_pollution: 'earthrelay-org',
  deforestation: 'earthrelay-org',
  illegal_logging: 'earthrelay-org',
  habitat_destruction: 'earthrelay-org',
  other: 'earthrelay-org',
  sewage_discharge: 'water-unit',
  water_pollution: 'water-unit',
  flood_damage: 'water-unit',
  river_overflow: 'water-unit',
  urban_flooding: 'water-unit',
  erosion: 'water-unit',
  wildlife: 'wildlife-unit',
  injured_wildlife: 'wildlife-unit',
}

const RESPONSE_TEAMS = {
  illegal_dumping: 'dumping response team',
  plastic_waste: 'plastic waste removal team',
  overflowing_garbage: 'waste collection team',
  construction_debris: 'debris removal team',
  e_waste: 'e-waste recovery team',
  tires_dumped: 'tire waste removal team',
  oil_spill: 'oil spill response team',
  sewage_discharge: 'sanitation response team',
  water_pollution: 'water pollution response team',
  wildfire_smoke: 'fire response team',
  grass_fire: 'fire response team',
  factory_smoke: 'smoke response team',
  burning_trash: 'fire response team',
  flood_damage: 'flood response team',
  river_overflow: 'flood response team',
  urban_flooding: 'flood response team',
  erosion: 'erosion response team',
  deforestation: 'forest protection team',
  illegal_logging: 'forest protection team',
  habitat_destruction: 'habitat recovery team',
  wildlife: 'wildlife response team',
  injured_wildlife: 'wildlife rescue team',
  air_pollution: 'air quality response team',
  chemical_spill: 'hazardous materials team',
  earthquake: 'earthquake response team',
  other: 'organization',
}

export const STATUS_LABELS = {
  pending: 'New',
  under_investigation: 'Investigating',
  cleanup_scheduled: 'Cleanup',
  resolved: 'Resolved',
}

export function routeFor(incidentType) {
  const id = ROUTE_MAP[incidentType] || 'earthrelay-org'
  return TEAMS.find((team) => team.id === id) || TEAMS[0]
}

export function teamLabel(id) {
  return TEAMS.find((team) => team.id === id)?.label || id || 'EarthRelay organization'
}

export function responseTeam(incidentType) {
  return RESPONSE_TEAMS[incidentType] || RESPONSE_TEAMS.other
}

export function forwardSentence(incidentType) {
  return `This case will be forwarded to the ${responseTeam(incidentType)}.`
}
