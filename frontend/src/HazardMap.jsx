import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const EMPTY = { type: 'FeatureCollection', features: [] }
const POINT_LAYERS = ['earthquake', 'tsunami', 'flood', 'wildlife', 'protected', 'case']

const FREE_STYLE = {
  version: 8,
  sources: {
    carto: {
      type: 'raster',
      tiles: ['https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    },
  },
  layers: [{ id: 'carto', type: 'raster', source: 'carto' }],
}

const LAYER_PAINT = {
  earthquake: {
    'circle-radius': [
      'interpolate',
      ['linear'],
      ['coalesce', ['get', 'magnitude'], 4.5],
      4.5,
      6,
      8,
      22,
    ],
    'circle-color': '#f59e0b',
    'circle-opacity': 0.78,
    'circle-stroke-width': 1.5,
    'circle-stroke-color': '#fde68a',
  },
  tsunami: {
    'circle-radius': 11,
    'circle-color': '#22d3ee',
    'circle-opacity': 0.82,
    'circle-stroke-width': 2,
    'circle-stroke-color': '#ecfeff',
  },
  flood: {
    'circle-radius': 8,
    'circle-color': '#3b82f6',
    'circle-opacity': 0.78,
    'circle-stroke-width': 1.5,
    'circle-stroke-color': '#bfdbfe',
  },
  wildlife: {
    'circle-radius': 6,
    'circle-color': '#a3e635',
    'circle-opacity': 0.8,
    'circle-stroke-width': 1,
    'circle-stroke-color': '#ecfccb',
  },
  protected: {
    'circle-radius': 7,
    'circle-color': '#34d399',
    'circle-opacity': 0.72,
    'circle-stroke-width': 1,
    'circle-stroke-color': '#bbf7d0',
  },
  case: {
    'circle-radius': 9,
    'circle-color': '#f472b6',
    'circle-opacity': 0.9,
    'circle-stroke-width': 2,
    'circle-stroke-color': '#fbcfe8',
  },
}

function satelliteSource(token, satellite) {
  if (token) {
    return {
      tiles: [
        `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg?access_token=${token}`,
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© Mapbox © Maxar',
    }
  }
  return {
    tiles: satellite?.tiles || gibsTiles(satellite?.date),
    tileSize: 256,
    maxzoom: satellite?.maxzoom || 9,
    attribution: satellite?.attribution || 'NASA GIBS',
  }
}

function gibsTiles(date) {
  const day = date || new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  return [
    `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${day}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
  ]
}

function popupHtml(props) {
  const mag = props.magnitude != null ? `M${Number(props.magnitude).toFixed(1)}` : props.severity
  const time = props.time ? new Date(props.time).toLocaleString() : ''
  const link = props.url
    ? `<a href="${props.url}" target="_blank" rel="noreferrer">Source report</a>`
    : ''
  return `
    <div class="er-popup">
      <div class="er-popup-kicker">${props.hazard || ''} · ${mag || ''}</div>
      <strong>${props.title || 'Map feature'}</strong>
      <p>${time}</p>
      <p>${props.source || ''}</p>
      ${link}
    </div>
  `
}

export default function HazardMap({
  geojson,
  satellite,
  layers,
  selectedId,
  onSelect,
  onInspect,
  placeTarget,
}) {
  const rootRef = useRef(null)
  const mapRef = useRef(null)
  const onSelectRef = useRef(onSelect)
  const onInspectRef = useRef(onInspect)
  onSelectRef.current = onSelect
  onInspectRef.current = onInspect

  const satWasOn = useRef(false)
  const searchMarker = useRef(null)
  const token = import.meta.env.VITE_MAPBOX_TOKEN

  useEffect(() => {
    if (!rootRef.current || mapRef.current) return

    mapboxgl.accessToken = token || 'unused'

    const map = new mapboxgl.Map({
      container: rootRef.current,
      style: token ? 'mapbox://styles/mapbox/streets-v12' : 'https://tiles.openfreemap.org/styles/liberty',
      center: [69.35, 30.38],
      zoom: 5,
      attributionControl: true,
    })
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true,
      showAccuracyCircle: true,
    })
    map.addControl(geolocate, 'bottom-right')
    geolocate.on('geolocate', (event) => {
      onInspectRef.current?.({ lng: event.coords.longitude, lat: event.coords.latitude })
    })
    mapRef.current = map

    map.on('load', () => {
      if (window.isSecureContext) {
        try {
          geolocate.trigger()
        } catch {
          // Phone must press Allow; the target button still works.
        }
      }
      const sat = satelliteSource(token, satellite)
      map.addSource('satellite', {
        type: 'raster',
        tiles: sat.tiles,
        tileSize: sat.tileSize,
        maxzoom: sat.maxzoom,
        attribution: sat.attribution,
      })
      map.addLayer({
        id: 'satellite',
        type: 'raster',
        source: 'satellite',
        layout: { visibility: layers.satellite ? 'visible' : 'none' },
        paint: { 'raster-opacity': 0.92 },
      })

      for (const hazard of POINT_LAYERS) {
        map.addSource(hazard, { type: 'geojson', data: EMPTY })
        map.addLayer({
          id: hazard,
          type: 'circle',
          source: hazard,
          paint: LAYER_PAINT[hazard],
        })
        map.on('click', hazard, (event) => {
          const feature = event.features?.[0]
          if (!feature) return
          event.originalEvent.stopPropagation?.()
          const props = feature.properties || {}
          onSelectRef.current?.(props.id)
          new mapboxgl.Popup({ closeButton: true, maxWidth: '280px' })
            .setLngLat(event.lngLat)
            .setHTML(popupHtml(props))
            .addTo(map)
        })
        map.on('mouseenter', hazard, () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', hazard, () => {
          map.getCanvas().style.cursor = ''
        })
      }

      map.on('click', (event) => {
        const hits = map.queryRenderedFeatures(event.point, { layers: POINT_LAYERS })
        if (hits.length) return
        onInspectRef.current?.(event.lngLat)
      })
    })

    return () => {
      searchMarker.current?.remove()
      searchMarker.current = null
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !placeTarget) return

    const go = () => {
      const { lat, lng, zoom, bbox, label, name } = placeTarget
      if (bbox?.length === 4) {
        map.fitBounds(
          [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[3]],
          ],
          { padding: 48, duration: 1100, maxZoom: 11 },
        )
      } else {
        map.flyTo({ center: [lng, lat], zoom: Math.max(zoom || 16, 15), speed: 1.35 })
      }
      searchMarker.current?.remove()
      searchMarker.current = new mapboxgl.Marker({ color: '#34d399' })
        .setLngLat([lng, lat])
        .setPopup(new mapboxgl.Popup({ offset: 18 }).setText(label || name || 'Selected place'))
        .addTo(map)
        .togglePopup()
    }

    if (map.isStyleLoaded()) go()
    else map.once('load', go)
  }, [placeTarget])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const apply = () => {
      if (map.getLayer('satellite')) {
        map.setLayoutProperty('satellite', 'visibility', layers.satellite ? 'visible' : 'none')
      }
      if (layers.satellite && !satWasOn.current && map.getZoom() < 4) {
        map.easeTo({ zoom: 5, duration: 900 })
      }
      satWasOn.current = !!layers.satellite
      for (const hazard of POINT_LAYERS) {
        const source = map.getSource(hazard)
        if (source && geojson) source.setData(geojson[hazard] || EMPTY)
        if (map.getLayer(hazard)) {
          map.setLayoutProperty(hazard, 'visibility', layers[hazard] ? 'visible' : 'none')
        }
      }
    }

    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }, [geojson, layers, satellite])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedId || !geojson) return
    const all = POINT_LAYERS.flatMap((hazard) => geojson[hazard]?.features || [])
    const match = all.find((feature) => feature.properties?.id === selectedId)
    const coords = match?.geometry?.coordinates
    if (!coords) return
    map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 4.5), speed: 1.2 })
  }, [selectedId, geojson])

  return <div ref={rootRef} className="hazard-map" />
}
