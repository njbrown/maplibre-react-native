import {
  Camera,
  CircleLayer,
  LineLayer,
  MapView,
  RasterLayer,
  RasterSource,
  ShapeSource,
  SymbolLayer,
  UserLocation,
  UserTrackingMode,
  type CameraPadding,
  type CameraRef,
} from "@maplibre/maplibre-react-native";
import type { Position } from "geojson";
import { useEffect, useRef, useState } from "react";
import { Text, Pressable, View, PixelRatio, Dimensions } from "react-native";
import * as Location from "expo-location";
import axios from "axios";
import polyLib from "@mapbox/polyline";

/*
INSTRUCTIONS:
1. Long press on the map to set a destination point.
2. Press "Fetch Route" to get the route from the current location to the destination.
3. Press "Navigate" to start navigation.



*/

export function BugReport() {
  const camRef = useRef<CameraRef | null>(null);
  const [followUserLocation, setFollowUserLocation] = useState(true);
  const [routePolygon, setRoutePolygon] = useState<any>(null);
  const [destination, setDestinationPoint] = useState<Position | null>(null);
  const [followUserMode, setFollowUserMode] = useState<UserTrackingMode>(
    UserTrackingMode.Follow
  );
  const [cameraPadding, setCameraPadding] = useState<CameraPadding | undefined>(
    undefined
  );
  const [cameraBounds, setCameraBounds] = useState<
    | {
        ne: [number, number];
        sw: [number, number];
      }
    | undefined
  >(undefined);
  const [followProps, setFollowProps] = useState<any | undefined>(undefined);
  const [locationProps, setLocationProps] = useState<any>({
    renderMode: "native",
  });

  const fetchNavigationRoute = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.log("Permission to access location was denied");
        return;
      }
      const position = await Location.getLastKnownPositionAsync();
      if (position && destination) {
        const userLocation = [
          position.coords.longitude,
          position.coords.latitude,
        ] satisfies [number, number];

        console.log("FETCHING ROUTE");
        const res = await getRouteFor(userLocation, destination!, "auto");

        const route = res.routes[0];

        const geom = route.geometry;
        if (!geom) return;

        const decoded = polyLib.decode(geom).map<[number, number]>((x) => {
          return [x[0] / 10, x[1] / 10];
        });

        // show on map
        const LineString = {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: decoded.map((x) => [x[1], x[0]]),
          },
        } satisfies GeoJSON.Feature;
        setRoutePolygon(LineString);

        // disable user location tracking
        setFollowUserLocation(false);

        // zoom to location
        const bounds = getFeatureBounds(LineString);
        if (bounds) {
          setCameraBounds({
            sw: [bounds.west, bounds.south],
            ne: [bounds.east, bounds.north],
          });

          // A bottom padding is set to show the route above the bottom bar (in the actual app)
          // I added it here because it highlights the issue of the camera padding not updating
          setCameraPadding({
            paddingBottom: 500,
            paddingTop: 50,
            paddingLeft: 30,
            paddingRight: 100,
          });
        }
      }
    } catch (error) {
      console.error("Error getting location:", error);
    }
  };

  const startNavigation = async () => {
    // update ui
    setFollowUserLocation(true);
    setFollowUserMode(UserTrackingMode.FollowWithCourse);

    const { height: screenHeight, width: screenWidth } =
      Dimensions.get("screen");

    const screenWidthPx = PixelRatio.getPixelSizeForLayoutSize(screenWidth);
    const screenHeightPx = PixelRatio.getPixelSizeForLayoutSize(screenHeight);

    // This should push the camera up so the UserLocation puck is closer to the bottom of the screen
    // but it doesn't work after the padding has been set in the fetchNavigationRoute function
    const padding = {
      paddingLeft: 0.0 * screenWidthPx,
      paddingTop: 0.5 * screenHeightPx,
      paddingRight: 0.0 * screenWidthPx,
      paddingBottom: 0.0 * screenHeightPx,
    };
    setCameraPadding(padding);

    setFollowProps({
      zoom: 16,
      follorZoomLevel: 16,
      pitch: 45,
      animationDuration: 900,
    });

    setLocationProps({
      renderMode: "native",
      androidRenderMode: "gps",
      animated: true,
    });
  };

  return (
    <View style={{ flex: 1, position: "relative" }}>
      <MapView
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          zIndex: 0,
        }}
        onLongPress={(event) => {
          // Get coordinates from the long press event
          const { coordinates } = event.geometry;
          // console.log("Map long pressed at:", coordinates);

          setDestinationPoint(coordinates);
        }}
      >
        <RasterSource
          id="basemap"
          tileUrlTemplates={[
            "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
            "https://mt2.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
            "https://mt3.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
          ]}
          tileSize={256}
          minZoomLevel={0}
          maxZoomLevel={24}
        >
          <RasterLayer id="basemap" />
        </RasterSource>
        <Camera
          zoomLevel={16}
          followUserLocation={followUserLocation}
          followUserMode={followUserMode}
          onUserTrackingModeChange={(event) => {
            if (!event.nativeEvent.payload.followUserLocation) {
              setFollowUserLocation(false);
              setCameraBounds(undefined);
              setCameraPadding(undefined);
            }
          }}
          padding={cameraPadding}
          bounds={cameraBounds}
          {...followProps}
          animationDuration={500}
        />
        <UserLocation {...locationProps} />

        {routePolygon && (
          <>
            <ShapeSource
              // key={'source' + updateKey}
              id="route-source"
              shape={routePolygon}
            >
              <LineLayer
                // sourceID={'route-source'}
                id="route-layer-bg"
                style={{
                  lineColor: "#29497d",
                  lineWidth: 15,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
              <LineLayer
                // sourceID={'source' + routePolygon}
                id="route-layer-fg"
                style={{
                  lineColor: "#326dd1",
                  lineWidth: 9,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            </ShapeSource>
          </>
        )}

        {destination && (
          <ShapeSource
            id="unknown-point"
            shape={{
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: destination,
              },
              properties: {
                title: "Destination",
              },
            }}
          >
            <SymbolLayer
              id="random-point-layer"
              style={{
                iconImage: "marker-15",
                iconSize: 1.5,
                textField: ["get", "title"],
                textSize: 14,
                textOffset: [0, -1.5],
                textHaloColor: "white",
                textHaloWidth: 2,
              }}
            />
            <CircleLayer
              id="random-point-layer-circle"
              style={{
                circleColor: "red",
                circleRadius: 8,
                circleOpacity: 0.8,
                circleStrokeWidth: 2,
                circleStrokeColor: "white",
              }}
            />
          </ShapeSource>
        )}
      </MapView>
      <View
        style={{
          position: "absolute",
          display: "flex",
          flexDirection: "row",
          bottom: 0,
          width: "100%",
          height: 80,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#007AFF",
          padding: 10,
          borderRadius: 5,
          zIndex: 1000,
        }}
      >
        <Pressable
          onPress={() => setFollowUserLocation(true)}
          style={{ flexGrow: 1 }}
          android_ripple={{
            color: "white",
          }}
        >
          <Text style={{ color: "white", fontWeight: "bold" }}>
            Toggle Follow User
          </Text>
        </Pressable>
        <Pressable onPress={fetchNavigationRoute} style={{ flexGrow: 1 }}>
          <Text style={{ color: "white", fontWeight: "bold" }}>
            Fetch Route
          </Text>
        </Pressable>
        <Pressable onPress={startNavigation} style={{ flexGrow: 1 }}>
          <Text style={{ color: "white", fontWeight: "bold" }}>Navigate</Text>
        </Pressable>
      </View>
    </View>
  );
}

export async function getRouteFor(
  start: [number, number],
  end: [number, number],
  costing: "auto" | "pedestrian" = "auto"
) {
  const result = await axios.post("https://valhalla1.openstreetmap.de/route", {
    locations: [
      {
        lon: start[0],
        lat: start[1],
      },
      {
        lon: end[0],
        lat: end[1],
      },
    ],
    costing,
    units: "km",
    format: "osrm",
  });
  if (result.status === 200) {
    return result.data;
  }
  return null;
}

const getFeatureBounds = (feature: GeoJSON.Feature) => {
  // console.log('FITTING BOUNDS');
  if (!feature || !feature.geometry) {
    console.warn("Invalid feature provided");
    return;
  }

  // Extract coordinates based on geometry type
  let coordinates = [];
  switch (feature.geometry.type) {
    case "Point":
      coordinates = [feature.geometry.coordinates];
      break;
    case "LineString":
      coordinates = feature.geometry.coordinates;
      break;
    case "Polygon":
      coordinates = feature.geometry.coordinates[0];
      break;
    // case 'MultiPoint':
    // case 'MultiLineString':
    //   coordinates = feature.geometry.coordinates.flat();
    //   break;
    // case 'MultiPolygon':
    //   coordinates = feature.geometry.coordinates.flat(2);
    //   break;
    default:
      console.warn("Unsupported geometry type");
      return;
  }

  // Calculate bounds
  const bounds = coordinates.reduce(
    (
      acc: { north: number; south: number; east: number; west: number },
      coord: GeoJSON.Position
    ) => {
      return {
        north: Math.max(acc.north, coord[1]),
        south: Math.min(acc.south, coord[1]),
        east: Math.max(acc.east, coord[0]),
        west: Math.min(acc.west, coord[0]),
      };
    },
    {
      north: -90,
      south: 90,
      east: -180,
      west: 180,
    }
  );

  return bounds;
};
