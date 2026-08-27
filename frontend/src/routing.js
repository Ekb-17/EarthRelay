export const PHONE_NOTICE =
  'For urgent cases or when additional information is required for investigation and response, the organization may contact the reporter directly.'

export function staffDeskLabel(claimedBy) {
  if (!claimedBy) return 'not claimed by staff'
  const name = String(claimedBy).replace(/\s*desk$/i, '').trim() || String(claimedBy)
  return `staff desk: ${name}`
}

export function staffDeskName(claimedBy) {
  if (!claimedBy) return ''
  return String(claimedBy).replace(/\s*desk$/i, '').trim() || String(claimedBy)
}

export const TEAMS = [
  {
    id: 'earthrelay-org',
    label: 'Waste / general',
    short: 'Waste',
  },
  {
    id: 'fire-team',
    label: 'Fire / smoke',
    short: 'Fire',
  },
  {
    id: 'water-unit',
    label: 'Water',
    short: 'Water',
  },
  {
    id: 'wildlife-unit',
    label: 'Wildlife',
    short: 'Wildlife',
  },
]

const ROUTE_MAP = {
  wildfire_smoke: 'fire-team',
  grass_fire: 'fire-team',
  factory_smoke: 'earthrelay-org',
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
  oil_spill: 'organization',
  sewage_discharge: 'sanitation response team',
  water_pollution: 'flood response team',
  wildfire_smoke: 'fire response team',
  grass_fire: 'fire response team',
  factory_smoke: 'organization',
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
  air_pollution: 'organization',
  chemical_spill: 'organization',
  earthquake: 'earthquake response team',
  other: 'organization',
}

export const STATUS_LABELS = {
  pending: 'New',
  under_investigation: 'Investigating',
  cleanup_scheduled: 'Cleanup',
  resolved: 'Closed',
}

export function routeFor(incidentType) {
  const id = ROUTE_MAP[incidentType] || 'earthrelay-org'
  return TEAMS.find((team) => team.id === id) || TEAMS[0]
}

export function teamLabel(id) {
  return TEAMS.find((team) => team.id === id)?.label || id || 'Waste / general'
}

export function responseTeam(incidentType) {
  return RESPONSE_TEAMS[incidentType] || RESPONSE_TEAMS.other
}

export function forwardSentence(incidentType) {
  if (isExtremeType(incidentType) || incidentType === 'earthquake') {
    return 'This case is now in the inbox. The organization will follow up from there.'
  }
  return 'This case is now in the inbox for follow-up.'
}

const CATEGORY_NOTICE = {
  wildfire_smoke: {
    kind: 'extreme',
    title: 'Stay back',
    lead: 'Stay back from the fire and smoke. Do not approach. Take the photo from a safe distance. If people are in immediate danger, contact local emergency services first. EarthRelay files an environmental case; it does not replace emergency response.',
  },
  grass_fire: {
    kind: 'extreme',
    title: 'Stay back',
    lead: 'Stay away from the grass fire and smoke. Do not try to put it out yourself. Take the photo from a safe distance. If people are in immediate danger, contact local emergency services first. EarthRelay does not replace emergency response.',
  },
  factory_smoke: {
    kind: 'extreme',
    title: 'Stay back',
    lead: 'Stay upwind of the smoke and do not go closer. Take the photo from a safe distance. If people are having trouble breathing, contact local emergency services first. EarthRelay does not replace emergency response.',
  },
  burning_trash: {
    kind: 'extreme',
    title: 'Stay back',
    lead: 'Stay back from burning waste and smoke. Do not try to extinguish it. Take the photo from a safe distance. If people are in immediate danger, contact local emergency services first. EarthRelay does not replace emergency response.',
  },
  earthquake: {
    kind: 'extreme',
    title: 'Stay back',
    lead: 'Stay clear of damaged buildings, walls, and loose debris. Aftershocks may follow. Take the photo from a safe distance. If people are trapped or injured, contact local emergency services first. EarthRelay does not replace emergency response.',
  },
  flood_damage: {
    kind: 'extreme',
    title: 'Stay back',
    lead: 'Stay out of floodwater and away from the edge. Do not walk or drive through it. Take the photo from a safe distance. If people are in immediate danger, contact local emergency services first. EarthRelay does not replace emergency response.',
  },
  river_overflow: {
    kind: 'extreme',
    title: 'Stay back',
    lead: 'Stay away from the overflowing river and the banks. Currents can change quickly. Take the photo from a safe distance. If people are in immediate danger, contact local emergency services first. EarthRelay does not replace emergency response.',
  },
  urban_flooding: {
    kind: 'extreme',
    title: 'Stay back',
    lead: 'Avoid flooded streets, drains, and underpasses. Do not walk through the water. Take the photo from a safe distance. If people are in immediate danger, contact local emergency services first. EarthRelay does not replace emergency response.',
  },
  oil_spill: {
    kind: 'extreme',
    title: 'Stay back',
    lead: 'Stay back from the oil. Do not touch it or try to clean it yourself. Take the photo from a safe distance. If people are in immediate danger, contact local emergency services first. EarthRelay does not replace emergency response.',
  },
  chemical_spill: {
    kind: 'extreme',
    title: 'Stay back',
    lead: 'Stay far back from the leak. Do not touch it, smell it, or go downwind. Take the photo from a safe distance. If anyone is exposed, contact local emergency services first. EarthRelay does not replace emergency response.',
  },
  erosion: {
    kind: 'extreme',
    title: 'Stay back',
    lead: 'Stay back from unstable slopes, mud, and the edge of the slide. Ground can give way without warning. Take the photo from a safe distance. If people are in immediate danger, contact local emergency services first. EarthRelay does not replace emergency response.',
  },
  injured_wildlife: {
    kind: 'extreme',
    title: 'Stay back',
    lead: 'Do not approach, touch, or try to rescue the animal. Keep people and pets away. Take the photo from a safe distance. If someone is already injured, contact local emergency services first. A wildlife rescue team will be alerted.',
  },
  illegal_dumping: {
    kind: 'cleanup',
    title: 'A team is being sent',
    lead: 'A dumping response team will be sent to the site for cleanup very soon. We will contact you if we need more information.',
  },
  plastic_waste: {
    kind: 'cleanup',
    title: 'A team is being sent',
    lead: 'A plastic waste removal team will be sent to collect and clear the waste very soon. We will contact you if we need more information.',
  },
  overflowing_garbage: {
    kind: 'cleanup',
    title: 'A team is being sent',
    lead: 'A waste collection team will be sent to clear the overflow very soon. We will contact you if we need more information.',
  },
  construction_debris: {
    kind: 'cleanup',
    title: 'A team is being sent',
    lead: 'A debris removal team will be sent to clear the construction material very soon. We will contact you if we need more information.',
  },
  e_waste: {
    kind: 'cleanup',
    title: 'A team is being sent',
    lead: 'An e-waste recovery team will be sent to collect the electronics for safe disposal very soon. We will contact you if we need more information.',
  },
  tires_dumped: {
    kind: 'cleanup',
    title: 'A team is being sent',
    lead: 'A tire waste removal team will be sent for cleanup very soon. We will contact you if we need more information.',
  },
  sewage_discharge: {
    kind: 'cleanup',
    title: 'A team is being sent',
    lead: 'A sanitation team will be sent to contain and clean the discharge very soon. Avoid contact with the water. We will contact you if we need more information.',
  },
  water_pollution: {
    kind: 'cleanup',
    title: 'A team is being sent',
    lead: 'A water pollution team will inspect the site very soon. Do not drink or touch the water. We will contact you if we need more information.',
  },
  deforestation: {
    kind: 'cleanup',
    title: 'A team is being sent',
    lead: 'A forest protection team will inspect the cleared area very soon. We will contact you if we need more information.',
  },
  illegal_logging: {
    kind: 'cleanup',
    title: 'A team is being sent',
    lead: 'A forest protection team will inspect the tree cutting very soon. We will contact you if we need more information.',
  },
  habitat_destruction: {
    kind: 'cleanup',
    title: 'A team is being sent',
    lead: 'A habitat recovery team will assess the damage very soon. We will contact you if we need more information.',
  },
  wildlife: {
    kind: 'cleanup',
    title: 'A team is being sent',
    lead: 'A wildlife response team will check the area very soon. Keep your distance until they arrive. We will contact you if we need more information.',
  },
  air_pollution: {
    kind: 'cleanup',
    title: 'A team is being sent',
    lead: 'An air quality team will review this report very soon. We will contact you if we need more information.',
  },
  other: {
    kind: 'cleanup',
    title: 'A team is being sent',
    lead: 'The organization will review this report and send a team if cleanup is needed. We will contact you if we need more information.',
  },
}

const EXTREME_TYPES = new Set(
  Object.entries(CATEGORY_NOTICE)
    .filter(([, item]) => item.kind === 'extreme')
    .map(([id]) => id),
)

export function isExtremeType(incidentType) {
  return EXTREME_TYPES.has(incidentType)
}

export function noticeCopy(incidentType, report) {
  if (report?.notice_title && report?.notice_lead) {
    return {
      kind: report.notice_kind || 'cleanup',
      kicker: 'EarthRelay',
      title: report.notice_title,
      lead: report.notice_lead,
    }
  }
  return {
    kind: 'review',
    kicker: 'EarthRelay',
    title: 'Photo under review',
    lead: 'After you submit, the photo and the selected category are both used. If the photo strongly shows a type, that type is filed. If people are in immediate danger, contact local emergency services first. EarthRelay files a case; it does not replace emergency response.',
  }
}

export function needsSafety(incidentType) {
  return Boolean(incidentType)
}

export const CALL_LOG = [
  ['no_answer', 'Called — no answer'],
  ['spoke', 'Called — spoke'],
  ['left_message', 'Called — left message'],
]

export const VISIT_LOG = [['on_site', 'On site']]
