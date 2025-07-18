

/*
              _                             _               _     __   __
         /\  | |                           | |             (_)    \ \ / /
        /  \ | |_ _ __ ___   ___  ___ _ __ | |__   ___ _ __ _  ___ \ V /
       / /\ \| __| '_ ` _ \ / _ \/ __| '_ \| '_ \ / _ \ '__| |/ __| > <
      / ____ \ |_| | | | | | (_) \__ \ |_) | | | |  __/ |  | | (__ / . \
     /_/    \_\__|_| |_| |_|\___/|___/ .__/|_| |_|\___|_|  |_|\___/_/ \_\
                                     | |
                                     |_|
    Written by: k3yomi@GitHub
    Version: v7.0.0
*/

/**
  * @class Mapbox
  * @description Handles the creation and management of a Mapbox map, layers, stations, spotter points, and storm reports.
  * This class integrates with Mapbox's API to render and update geographical data points, polygons, and markers.
  *
  * The class also manages map-related UI elements and configurations for rendering radar stations, spotters, and alerts.
  */

  function getURLFlag(flagName, def = false) {
    const params = new URLSearchParams(window.location.search);
    if (!params.has(flagName)) return def;
    const val = params.get(flagName)?.toLowerCase();
    return val === '' || val === '1' || val === 'true';
  }

class Mapbox {
    constructor(library, autoFly, alertsInstance) {

        this.lastAutoFlyTime = 0; // timestamp of last fly
        this.autoFlyDelay = 30000; // 15 seconds between alert jumps

        this.library = library
        this.storage = this.library.storage
        this.auto = autoFly
        this.alerts = alertsInstance
        this.name = `MapboxClass`

        this.stopAuto = getURLFlag('stop');   // e.g.  ?stop or ?stop=true
        this.maybeFlyTo = (opts) => {
          if (!this.stopAuto) this.storage.mapbox.flyTo(opts);
        };

        this.library.createOutput(`${this.name} Initialization`, `Successfully initialized ${this.name} module`)
        this.createMapBoxSession()
        /*  Add once, not inside click handlers */
        window._relaySock = new WebSocket('ws://localhost:8787');
        window._relaySock.addEventListener('open', ()=>console.log('[WX] WS relay connected'));
        window._relaySock.addEventListener('error',err=>console.error('Relay WS err',err));
        document.addEventListener('onCacheUpdate', (event) => {})
    }

    /**
      * @function createMapBoxSession
      * @description Creates a new Mapbox session and initializes the map with the given widget settings.
      * If the map style isn't loaded, it waits for it to load before adding layers.
      *
      * @async
      */

    createMapBoxSession = async function() {
        if (!this.storage.mapbox) {
            this.storage.mapbox = new mapboxgl.Map({
                ...this.storage.configurations.widget_settings.mapbox.settings,
                accessToken: this.storage.configurations.widget_settings.mapbox.api_key
            })
            this.storage.mapbox.on(`load`, async () => { })
        }
    }

    /**
      * @function createPolygonSource
      * @description Creates a polygon source and layer on the Mapbox map.
      *
      * @param {Array} polygonPlots - An array of polygon objects containing coordinates, color, and description.
      * @param {string} targetedSource - The ID of the source to be created or updated.
      * @param {string} targetedLayer - The ID of the layer to be created or updated.
      */

    createPolygonSource = function(polygonPlots, targetedSource=`mapbox-gl-example-polygon-source`, targetedLayer=`mapbox-gl-example-polygon-layer`) {
        let GeoJSON = [];
        for (let i = 0; i < polygonPlots.length; i++) {
            let polygon = polygonPlots[i];
            GeoJSON.push({
                type: `Feature`,
                geometry: {
                    type: `Polygon`,
                    coordinates: [polygon.coordinates]
                },
                properties: {
                    color: polygon.color,
                    description: polygon.description ? polygon.description : ``,
                    fullAlert:   polygon.fullAlert
                }
            });
        }
        let getSource = this.storage.mapbox.getSource(targetedSource)
        if (!getSource) {
            this.storage.mapbox.addSource(targetedSource, {type: `geojson`,data: { type: `FeatureCollection`, features: GeoJSON }});
        } else {
            getSource.setData({type: `FeatureCollection`,features: GeoJSON});
        }
        if (!this.storage.mapbox.getLayer(targetedLayer)) {
            this.storage.mapbox.addLayer({
              id: targetedLayer,
              type: `line`,
              source: targetedSource,
              paint: {'line-color': ['get', 'color'], 'line-width': 8}
            });
            this.storage.mapbox.addLayer({
              id:   `${targetedLayer}-fill`,
              type: 'fill',
              source: targetedSource,
              paint: {
                // a faint tint so you know it worked; set to 0 if you want it invisible
                'fill-color': ['get', 'color'],
                'fill-opacity': 0.05
              }
            }, targetedLayer);
        }

        //this.storage.mapbox.on('click', targetedLayer, (e) => {
        //    let coordinates = e.features[0].geometry.coordinates[0][0].slice();
        //    let description = e.features[0].properties.description;
        //    if (description === ``) {description = `No description provided`}
        //    while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360}
        //    if (this.currentPopup) {this.currentPopup.remove();}
        //    this.currentPopup = new mapboxgl.Popup({ className: 'widgets-custom-popup' }).setLngLat(coordinates).setHTML(`<div>${description}</div>`).addTo(this.storage.mapbox);
        //});
        //this.storage.mapbox.on('mouseenter', targetedLayer, () => {
        //    this.storage.mapbox.getCanvas().style.cursor = 'pointer';
        //});
        //this.storage.mapbox.on('mouseleave', targetedLayer, () => {
        //    this.storage.mapbox.getCanvas().style.cursor = '';
        //});
    }


    /**
      * @function createDotSource
      * @description Creates a dot source and layer on the Mapbox map.
      *
      * @param {Array} dotPlots - An array of dot objects containing latitude, longitude, color, description, and autoZoom.
      * @param {string} targetedSource - The ID of the source to be created or updated.
      * @param {string} targetedLayer - The ID of the layer to be created or updated.
      */

    createDotSource = function(dotPlots, targetedSource=`mapbox-gl-example-dot-source`, targetedLayer=`mapbox-gl-example-dot-layer`) {
        let GeoJSON = [];
        for (let i = 0; i < dotPlots.length; i++) {
            let dot = dotPlots[i];
            GeoJSON.push({
                type: `Feature`,
                geometry: {
                    type: `Point`,
                    coordinates: [dot.longitude, dot.latitude],
                },
                properties: {
                    color: dot.color,
                    description: dot.description ? dot.description : `No description provided`,
                    size: dot.size ? dot.size : 4,
                }
            });
        }
        let getSource = this.storage.mapbox.getSource(targetedSource)
        if (!getSource) {
            this.storage.mapbox.addSource(targetedSource, {type: `geojson`,data: { type: `FeatureCollection`, features: []}});
        } else {
            getSource.setData({type: `FeatureCollection`,features: GeoJSON});
        }
        if (!this.storage.mapbox.getLayer(targetedLayer)) {
            this.storage.mapbox.addLayer({id: targetedLayer,type: `circle`,source: targetedSource,paint: { 'circle-radius': ['get', 'size'], 'circle-color': ['get', 'color'], 'circle-opacity': 0.8, 'circle-stroke-width': 1, 'circle-stroke-color': `rgb(255, 255, 255)`,},filter: ['!=', ['get', 'description'], ``]});
        }

        //this.storage.mapbox.on('click', targetedLayer, (e) => {
        //    let coordinates = e.features[0].geometry.coordinates.slice();
        //    let description = e.features[0].properties.description;
        //    if (description === ``) {description = `No description provided`}
        //    while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360}
        //    if (this.currentPopup) {this.currentPopup.remove();}
        //    this.currentPopup = new mapboxgl.Popup({ className: 'widgets-custom-popup' }).setLngLat(coordinates).setHTML(`<div>${description}</div>`).addTo(this.storage.mapbox);
        //});
//
        //this.storage.mapbox.on('mouseenter', targetedLayer, () => {
        //    this.storage.mapbox.getCanvas().style.cursor = 'pointer';
        //});
//
        //this.storage.mapbox.on('mouseleave', targetedLayer, () => {
        //    this.storage.mapbox.getCanvas().style.cursor = '';
        //});
    }

    /**
      * @function displayReports
      * @description Displays storm reports on the Mapbox map by creating a dot source and layer.
      */

    displayReports = function() {
        let reports = this.storage.reports
        let reportPlots = []
        for (let i = 0; i < reports.length; i++) {
            let report = reports[i]
            reportPlots.push({
                latitude: report.latitude,
                longitude: report.longitude,
                color: `rgb(255, 255, 255)`,
                description: `Event: ${report.event}<br>Description: ${report.description}<br>Sender: ${report.sender}`,
            })
        }
        this.createDotSource(reportPlots, `storm-reports-source`, `storm-reports-layer`)
    }

    /**
      * @function displaySpotters
      * @description Displays spotters on the Mapbox map by creating a dot source and layer.
      */

    displaySpotters = function() {
        let spotters = this.storage.spotters
        let spotterPlots = []
        let scheme = this.storage.configurations.widget_settings.mapbox.spotter_network_settings.spotter_scheme
        for (let i = 0; i < spotters.length; i++) {
            let spotter = spotters[i]
            let selectedColor = scheme.default.color
            if (spotter.idle == 1) { selectedColor = scheme.idle.color }
            if (spotter.active == 1) { selectedColor = scheme.active.color }
            if (spotter.streaming == 1) { selectedColor = scheme.streaming.color }
            let description = spotter.description.toString().replace(/\\n/g, '<br>').replace('"', '')
            spotterPlots.push({
                latitude: spotter.lat,
                longitude: spotter.lon,
                color: selectedColor,
                description: `${description}`,
            })
        }
        this.createDotSource(spotterPlots, `spotter-network-source`, `spotter-network-layer`)
    }


    getPolygonCenter = function(coords) {
      let totalX = 0, totalY = 0, count = 0;
      for (let i = 0; i < coords.length; i++) {
          totalX += coords[i][0];
          totalY += coords[i][1];
          count++;
      }
      return [totalX / count, totalY / count];
    }

    /**
      * @function displayAlerts
      * @description Displays alerts on the Mapbox map by creating a polygon source and layer.
      */

    displayAlerts = function() {
        let alerts = this.storage.active
        let alertPlots = []
        let scheme = this.storage.configurations.scheme
        let hasSetZoom = false
        alerts.sort((a, b) => new Date(b.details.issued) - new Date(a.details.issued))
        for (let i = 0; i < alerts.length; i++) {
            let alert = alerts[i]
            let triggerZoom = false
            if (!alert.raw.geometry) { continue; }
            if (alert.raw.geometry.coordinates.length == 0 ) { continue; }
            if (alert.raw.geometry.coordinates[0].length == 0) { continue; }
            if (hasSetZoom == false) { hasSetZoom = true; triggerZoom = true;  }
            let location = alert.details.locations;
            let sender = alert.details.sender;
            let eventColor = scheme.find(color => alert.details.name.toLowerCase().includes(color.type.toLowerCase())) || scheme.find(color => color.type === "Default");
            let coords = alert.raw.geometry.coordinates[0].map(point => [point[0], point[1]]);
            let name = alert.details.name;
            let type = alert.details.type;
            let issued = new Date(alert.details.issued).toLocaleString();
            let expires = new Date(alert.details.expires).toLocaleString();
            let tags = alert.details.tag == undefined ? `No tags found` : alert.details.tag
            tags = JSON.stringify(tags).replace(/\"/g, ``).replace(/,/g, `, `).replace(/\[/g, ``).replace(/\]/g, ``)
            let description = `<b>${name} (${type})</b><br>${location}<br><br><b>Sender:</b> ${sender}<br><b>Issued:</b> ${issued}<br><b>Expires:</b> ${expires}<br>Tags: ${tags}`;
            if (triggerZoom && !this.auto && this.storage.realtime.length == 0) {
                this.maybeFlyTo({
                  center: [alert.raw.geometry.coordinates[0][0][0], alert.raw.geometry.coordinates[0][0][1]],
                  zoom: 9,
                  speed: 0.4,
                  pitch: 0,
                  bearing: 0
                });
                if (description === ``) {description = `No description provided`}
                // if (this.currentPopup) {this.currentPopup.remove();}
                // this.currentPopup = new mapboxgl.Popup({ className: 'widgets-custom-popup' })
                  // .setLngLat([alert.raw.geometry.coordinates[0][0][0], alert.raw.geometry.coordinates[0][0][1]])
                  // .setHTML(`<div>${description}</div>`)
                  // .addTo(this.storage.mapbox);
            }
            alertPlots.push({
                issued: issued,
                coordinates: coords,
                color: eventColor.color.light,
                description: description,
                autoZoom: triggerZoom,
                eventColor,
                fullAlert: alert
            })
        }
        const now = Date.now();
        if (now - this.lastAutoFlyTime >= this.autoFlyDelay) {
          let validAlertFound = false;
          while (!validAlertFound && alertPlots.length > 0) {
            let randomAlert = alertPlots[Math.floor(Math.random() * alertPlots.length)];

            if (randomAlert.coordinates?.[0]?.length > 0) {
              validAlertFound = true;

              this.maybeFlyTo({
                center: this.getPolygonCenter(randomAlert.coordinates),
                zoom: 8,
                speed: 0.4,
                pitch: 0,
                bearing: 0
              });

              if (this.auto) {
                const channel = new BroadcastChannel('wx-sync');
                channel.postMessage({
                  type: 'warning-selected',
                  name: randomAlert.fullAlert.details.name,
                  loc: randomAlert.fullAlert.details.locations,
                  desc: randomAlert.fullAlert.details.description,
                  expires : randomAlert.fullAlert.details.expires,
                  light: randomAlert.eventColor.color.light,
                  dark: randomAlert.eventColor.color.dark
                });
              }

              this.lastAutoFlyTime = now;

            } else {
              alertPlots.splice(alertPlots.indexOf(randomAlert), 1);
            }

          }
        }

        this.createPolygonSource(alertPlots, `alert-polygons-source`, `alert-polygons-layer`)

        // --- attach click -> broadcast once ---
        if (!this._polygonClickBound) {
          this._polygonClickBound = true;

          /* (A)  CLICK ON a polygon → build payload & broadcast 'warning-click' */
          this.storage.mapbox.on('click', 'alert-polygons-layer-fill', e => {
            if (!e.features?.length) return;

            // GeoJSON props may already be an object, or a JSON string
            let props = e.features[0].properties;
            try { props = typeof props === 'string' ? JSON.parse(props) : props; } catch {}

            /* ------- helper to safely pick values ------- */
            const pick = (obj, ...paths) => {
              for (const p of paths) {
                const v = p.split('.').reduce((o, k) => o?.[k], obj);
                if (v !== undefined && v !== null && v !== '') return v;
              }
            };

            /* pick from fullAlert → raw → props */
            let full = props.fullAlert ?? props;
            try { full = typeof full === 'string' ? JSON.parse(full) : full; } catch {}

            const src = full.details
                      ?? full.raw?.properties
                      ?? full.properties
                      ?? {};

            const payload = {
              id:        pick(src, 'id', 'event_id'),
              title:     pick(src, 'name', 'event'),
              location:  pick(src, 'locations', 'areaDesc'),
              issuedAt:  pick(src, 'issued',  'sent'),
              expiresAt: pick(src, 'expires', 'ends'),
              hail:      pick(src, 'max_hail', 'hail', 'parameters.hail') ?? 'N/A',
              wind:      pick(src, 'max_wind', 'wind', 'parameters.wind') ?? 'N/A',
              tornado:   pick(src, 'tornado',  'parameters.tornado')     ?? 'N/A',
              damage:    pick(src, 'damage',   'parameters.damage')      ?? 'N/A',
              office:    pick(src, 'sender',   'senderName'),
              tags: (() => {
                const v = pick(src, 'tag', 'parameters.NWSheadline');
                return Array.isArray(v) ? v.join(', ') : (v ?? 'None');
              })(),
            };

            console.log('[WX] polygon clicked ⇒', payload);

            /* broadcast via BroadcastChannel */
            new BroadcastChannel('wx-click').postMessage({
              type: 'warning-click',
              data: payload
            });

            /* send via WebSocket relay to OBS */
            if (window._relaySock?.readyState === 1) {
              window._relaySock.send(JSON.stringify({
                type: 'warning-click',
                data: payload
              }));
            }
          });

          /* (B)  CLICK OFF any polygon → broadcast 'warning-hide' */
          this.storage.mapbox.on('click', e => {
            const feats = this.storage.mapbox.queryRenderedFeatures(e.point, {
              layers: ['alert-polygons-layer-fill']
            });
            if (feats.length === 0) {
              new BroadcastChannel('wx-click').postMessage({ type: 'warning-hide' });
              if (window._relaySock?.readyState === 1) {
                window._relaySock.send(JSON.stringify({ type: 'warning-hide' }));
              }
            }
          });

          /* cursor changes over polygons */
          this.storage.mapbox.on('mouseenter', 'alert-polygons-layer-fill', () => {
            this.storage.mapbox.getCanvas().style.cursor = 'pointer';
          });
          this.storage.mapbox.on('mouseleave', 'alert-polygons-layer-fill', () => {
            this.storage.mapbox.getCanvas().style.cursor = '';
          });
        }  // end _polygonClickBound


    }


    /**
      * @function realTimeIRL
      * @description Displays the user's current location on the Mapbox map by creating a dot source and layer.
      */

    realTimeIRL = async function() {
        if (Object.keys(this.storage.realtime).length > 0) {
            let latitude = this.storage.realtime.lat
            let longitude = this.storage.realtime.lon
            let location = this.storage.realtime.county + `, ` + this.storage.realtime.state
            let color = `rgb(255, 0, 191)`
            let description = `You are here!`
            let dotPlots = [{ latitude: latitude, longitude: longitude, color: color, description: location, size: 10}]
            this.maybeFlyTo({center: [longitude, latitude], zoom: 9, speed: 0.8, pitch: 0});
            this.createDotSource(dotPlots, `realtimeirl-source`, `realtimeirl-layer`)
        }
    }


    displayRadar = async function () {
        try {
            let response = await this.library.createHttpRequest('https://api.rainviewer.com/public/weather-maps.json');
            let data = await response.json();
            let latestRadar = data.radar.past.at(-1);
            if (!latestRadar || !latestRadar.time) return;
            if (this.lastRadarTime === latestRadar.time) return;
            this.lastRadarTime = latestRadar.time;
            let radarSourceId = 'radar-source';
            let radarLayerId = 'radar-layer';
            let radarTiles = [`https://tilecache.rainviewer.com/v2/radar/${latestRadar.time}/512/{z}/{x}/{y}/6/0_0.png`];
            if (this.storage.mapbox.getLayer(radarLayerId)) {
                this.storage.mapbox.removeLayer(radarLayerId);
            }
            if (this.storage.mapbox.getSource(radarSourceId)) {
                this.storage.mapbox.removeSource(radarSourceId);
            }
            this.storage.mapbox.addSource(radarSourceId, {
                type: 'raster',
                tiles: radarTiles,
                tileSize: 256
            });
            this.storage.mapbox.addLayer({
                id: radarLayerId,
                type: 'raster',
                source: radarSourceId,
                paint: { 'raster-opacity': 0.5 }
            });


            if (this.storage.mapbox.getLayer('alert-polygons-layer')) {
              this.storage.mapbox.moveLayer('alert-polygons-layer');
            }

        } catch (err) {}
    }

    /**
      * @function updateThread
      * @description Updates the Mapbox map by displaying reports, spotters, and alerts.
      * It checks if the map style is loaded before updating.
      */

    updateThread = function() {
        if (!this.storage.mapbox.isStyleLoaded()) { setTimeout(() => { this.updateThread() }, 15000); return; }

        this.storage.mapbox.setPitch(0)
        this.storage.mapbox.setBearing(0)

        this.displayReports()
        this.displaySpotters()
        this.realTimeIRL()
        this.displayRadar()
        this.displayAlerts()
    }
}
