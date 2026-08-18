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

export function forwardSentence(incidentType) {
  const team = routeFor(incidentType)
  if (team.id === 'fire-team') {
    return 'This case will be forwarded to the fire response team.'
  }
  if (team.id === 'water-unit') {
    return 'This case will be forwarded to the water unit.'
  }
  if (team.id === 'wildlife-unit') {
    return 'This case will be forwarded to the wildlife unit.'
  }
  return 'This case will be forwarded to the organization.'
}
