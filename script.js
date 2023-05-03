let territoryStyle = {
    "color": "#0055FF",
    "weight": 1,
    "opacity": 0.9
};

let highlightedAirport = {
    fillColor: "#FFFFFF",
    pane: 'highlighted_airports'
}

const airportStyles = {
    large_airport: {
        radius: 6,
        color: "#000",
        weight: 0.5,
        fillColor: "#0099FF",
        pane: 'large_airports'
    },
    medium_airport: {
        radius: 5,
        color: "#000",
        weight: 0.5,
        fillColor: "#FFCC00",
        pane: 'medium_airports'
    },
    small_airport: {
        radius: 4,
        color: "#000",
        weight: 0.5,
        fillColor: "#FF0000",
        pane: 'small_airports'
    }
};

let map = L.map('map', {worldCopyJump: true}).setView([40, -112.5], 4);
L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png', {
    maxZoom: 9
}).addTo(map);  

map.createPane('highlighted_airports');
map.createPane('large_airports');
map.createPane('medium_airports');
map.createPane('small_airports');

map.getPane('highlighted_airports').style.zIndex = 610;
map.getPane('large_airports').style.zIndex = 605;
map.getPane('medium_airports').style.zIndex = 602;
map.getPane('small_airports').style.zIndex = 601;

let selectedMarkers = new Set([]);

function resetSelectedMarkers() {
    for (const key of Object.keys(markers)) {
        const marker = markers[key];
        marker.point.setStyle({fillOpacity: 1.0, opacity: 1.0, ...marker.style});
    }
    
    selectedMarkers.clear();
    statesWanted.clear();
    provincesWanted.clear();
    countriesWanted.clear();
}

map.on('click', function (e) {
    const bounds = map.getBounds();
    const clickedMarkers = Object.values(markers).filter(marker => {
        const {lat, lng} = marker.point.getLatLng();
        return lat >= bounds.getSouthWest().lat &&
               lat <= bounds.getNorthEast().lat &&
               lng >= bounds.getSouthWest().lng &&
               lng <= bounds.getNorthEast().lng;
    });
    
    const found = clickedMarkers.some(marker => e.latlng.equals(marker.point.getLatLng()));
    if (found) {
        return;
    }

    resetSelectedMarkers();

    drawSelected();
});

let countriesWanted = new Set([]);
let statesWanted = new Set([]);
let provincesWanted = new Set([]);

const markers = {};

initSqlJs({
    locateFile: filename => `resources/${filename}`
}).then(SQL => {
    Promise.all([
        fetch("resources/data/routes.db").then(res => res.arrayBuffer()).then(arr => new SQL.Database(new Uint8Array(arr))),
        fetch("resources/data/airports.json").then(response => response.json())
    ]).then(([routesDB, airports]) => {
        const statement = routesDB.prepare("SELECT ArrivalIATA FROM Routes WHERE DepartureIATA = ?;");
        const onClickWrapper = function(airport) {
            return function (e) {
                resetSelectedMarkers();

                statesWanted.length = 0;
                provincesWanted.length = 0;
                countriesWanted.length = 0;

                selectedMarkers.add(airport);
                statement.bind([airport])
                while (statement.step()) {
                    const destination = statement.get()[0];
                    selectedMarkers.add(destination);
                    const airport = airports.find(airport => airport.iata_code === destination);
                    if (airport) {
                        if (airport.iso_country === "US") {
                            statesWanted.add(airport.iso_region);
                        } else if (airport.iso_country === "CA") {
                            provincesWanted.add(airport.iso_region);
                        } else {
                            countriesWanted.add(airport.iso_country);
                        }
                    }
                }

                map.eachLayer(function(layer) {
                    if (layer instanceof L.CircleMarker) {
                        layer.setStyle({fillOpacity: 0.2, opacity: 0.2});
                    }
                });

                selectedMarkers.forEach(markerId => {
                    if (markers[markerId]) {
                        let point = markers[markerId].point;
                        point.setStyle({fillOpacity: 1.0, opacity: 1.0, ...highlightedAirport})
                    }
                });

                drawSelected();
            }
        }

        const prepped = routesDB.prepare("SELECT COUNT(DISTINCT ArrivalIATA) FROM Routes WHERE DepartureIATA = ?;");
        airports.forEach(element => {
            prepped.bind([element.iata_code]);
            prepped.step();
            const count = prepped.get()[0];
            if (count != 0) {
                if (count > 30) {
                    element.type = "large_airport";
                } else if (count > 7) {
                    element.type = "medium_airport";
                } else {
                    element.type = "small_airport";
                }

                const style = airportStyles[element.type];
                for (let i = 0; i <= 0; i++) {
                    markers[element.iata_code] = 
                    {point: L.circleMarker([element.coordinates[0], element.coordinates[1] + (i * 360)], {fillOpacity: 1.0, opacity: 1.0, ...style})
                        .bindTooltip(element.name + " (" + element.iata_code + ")")
                        .addTo(map)
                        .on('click', onClickWrapper(element.iata_code)), style: style};
                }
            }
        });
    });
});

let territoriesLayerGroup = L.layerGroup().addTo(map);

function draw(feature) {
    L.geoJSON(feature, {style: territoryStyle}).addTo(territoriesLayerGroup);
}

function drawSelected() {
    territoriesLayerGroup.clearLayers();
    Promise.all([
        fetch("resources/geojson/countries.geojson").then(response => response.json()),
        fetch("resources/geojson/usa.geojson").then(response => response.json()),
        fetch("resources/geojson/canada.geojson").then(response => response.json())
    ]).then(([countries, usa, canada]) => {
        countries.features
            .filter(feature => countriesWanted.has(feature.properties.ISO_A2))
            .forEach(draw);
        usa.features
            .filter(feature => statesWanted.has(feature.properties.iso_region_code))
            .forEach(draw);
        canada.features
            .filter(feature => provincesWanted.has(feature.properties.iso_region_code))
            .forEach(draw);
    });
}