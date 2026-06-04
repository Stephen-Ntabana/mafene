/**
 * Programmatic SVG floor plan for Floor 0.
 * Every wall zone, corridor, room, label, and nav element is drawn in code —
 * no background image required.
 */

import React from "react";
import { Dimensions, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient as SvgGradient,
  Polygon,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";

import {
  FLOOR0_BUILDING as B,
  FLOOR0_CORRIDORS,
  FLOOR0_LABELS,
  FLOOR0_ROOMS,
} from "../constants/floor0SVG";
import {
  JUNCTION_POINTS_FLOOR0,
  WALKABLE_CONNECTIONS_FLOOR0,
} from "../constants/floorData";

// ─── Types ───────────────────────────────────────────────────────────────────

type Pt  = { x: number; y: number };
type Loc = { name: string; x: number; y: number; icon: string };

interface Props {
  locations:           Loc[];
  userPos:             (Pt & { name: string }) | null;
  selectedDestination: (Pt & { name: string }) | null;
  path:                Pt[];
  arrived:             boolean;
}

// ─── Room theming ─────────────────────────────────────────────────────────────

function theme(name: string): { bg: string; border: string; label: string } {
  const n = name.toLowerCase();
  if (n.includes("shop") || n.includes("101"))
    return { bg: "#FFF8E1", border: "#FFB300", label: "#E65100" };
  if (n.includes("washroom") || n.includes("toilet"))
    return { bg: "#E8F5E9", border: "#4CAF50", label: "#1B5E20" };
  if (n === "lift")
    return { bg: "#EDE7F6", border: "#7E57C2", label: "#311B92" };
  if (n.includes("storage"))
    return { bg: "#ECEFF1", border: "#78909C", label: "#263238" };
  if (n.includes("balcony"))
    return { bg: "#E0F7FA", border: "#26C6DA", label: "#006064" };
  if (n.includes("glass") || n.includes("cabinet"))
    return { bg: "#FFF3E0", border: "#FFA726", label: "#BF360C" };
  if (n.includes("corridor") || n.includes("circulation") || n.includes("spaces"))
    return { bg: "#E3F2FD", border: "#42A5F5", label: "#0D47A1" };
  return { bg: "#F5F5F5", border: "#BDBDBD", label: "#424242" };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProgrammaticFloorPlan({
  locations,
  userPos,
  selectedDestination,
  path,
  arrived,
}: Props) {
  const { width: screenW } = Dimensions.get("window");
  const dispW = screenW - 30;                       // horizontal margins 15+15
  const dispH = Math.round(dispW * (B.h / B.w));    // maintain aspect ratio

  // viewBox crops the 1581×737 coordinate space to just the building footprint
  const viewBox = `${B.x} ${B.y} ${B.w} ${B.h}`;

  // Unit scalar: 1 display-pixel expressed in SVG-unit space
  const u = B.w / dispW;

  // Scaled sizes (all in SVG units)
  const strokeWall   = 2.5 * u;
  const strokeNav    = 5   * u;
  const rJunction    = 4   * u;
  const rLocation    = 11  * u;
  const rUser        = 15  * u;
  const rDest        = 13  * u;
  const fontSize     = 16  * u;
  const fontSizeSm   = 11  * u;
  const roomRadius   = 6   * u;
  const dashLen      = `${14 * u},${9 * u}`;

  // Separate glass-cabinet labels from main labels
  const mainLabels  = FLOOR0_LABELS.filter(l => !l.text.toLowerCase().includes("glass"));
  const cabinetLabels = FLOOR0_LABELS.filter(l => l.text.toLowerCase().includes("glass"));

  return (
    <View
      style={{
        width: dispW, height: dispH,
        borderRadius: 14, overflow: "hidden",
        elevation: 4,
        shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15, shadowRadius: 6,
      }}
    >
      <Svg width={dispW} height={dispH} viewBox={viewBox}>
        <Defs>
          {/* Gradient for the building background */}
          <SvgGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FAFAFA" />
            <Stop offset="1" stopColor="#EEEEEE" />
          </SvgGradient>
        </Defs>

        {/* ── 1. Building background ───────────────────────────────────── */}
        <Rect
          x={B.x} y={B.y} width={B.w} height={B.h}
          fill="url(#bgGrad)"
          stroke="#CFD8DC" strokeWidth={strokeWall * 1.5}
          rx={10 * u}
        />

        {/* ── 2. Room background fills ─────────────────────────────────── */}
        {FLOOR0_ROOMS.map((r, i) => {
          const { bg, border } = theme(r.name);
          return (
            <Rect
              key={`room-${i}`}
              x={r.x} y={r.y} width={r.w} height={r.h}
              fill={bg} stroke={border}
              strokeWidth={strokeWall * 0.8}
              rx={roomRadius}
              opacity={0.85}
            />
          );
        })}

        {/* ── 3. Glass cabinet markers (small dashed rectangles) ────────── */}
        {cabinetLabels.map((c, i) => (
          <Rect
            key={`cab-${i}`}
            x={c.x - 28 * u} y={c.y - 18 * u}
            width={56 * u} height={36 * u}
            fill="#FFF3E0" stroke="#FFA726"
            strokeWidth={strokeWall * 0.6}
            strokeDasharray={`${6 * u},${4 * u}`}
            rx={3 * u} opacity={0.6}
          />
        ))}

        {/* ── 4. Corridor (walkable) area fills ────────────────────────── */}
        {FLOOR0_CORRIDORS.map((c, i) => (
          <Polygon
            key={`cor-${i}`}
            points={c.points}
            fill="#DEEDF9"
            stroke="#90CAF9"
            strokeWidth={strokeWall}
            opacity={0.9}
          />
        ))}

        {/* ── 5. Faint walkable-connection grid ────────────────────────── */}
        {WALKABLE_CONNECTIONS_FLOOR0.map((c, i) => (
          <Line
            key={`wc-${i}`}
            x1={c.from.x} y1={c.from.y}
            x2={c.to.x}   y2={c.to.y}
            stroke="#B0BEC5" strokeWidth={strokeWall * 0.4}
            strokeOpacity={0.35}
          />
        ))}

        {/* ── 6. Junction nodes (routing graph dots) ───────────────────── */}
        {JUNCTION_POINTS_FLOOR0.map((j, i) => (
          <Circle
            key={`junc-${i}`}
            cx={j.x} cy={j.y} r={rJunction}
            fill="#90A4AE" opacity={0.25}
          />
        ))}

        {/* ── 7. Room + zone labels ─────────────────────────────────────── */}
        {mainLabels.map((l, i) => {
          const { label: tc } = theme(l.text);
          const isZone = l.text.toLowerCase().includes("corridor")
            || l.text.toLowerCase().includes("circulation")
            || l.text.toLowerCase().includes("spaces");
          return (
            <SvgText
              key={`lbl-${i}`}
              x={l.x} y={l.y + fontSize * 0.35}
              fontSize={isZone ? fontSizeSm * 1.1 : fontSize}
              fill={tc} textAnchor="middle"
              fontWeight={isZone ? "400" : "600"}
              fontStyle={isZone ? "italic" : "normal"}
              opacity={isZone ? 0.7 : 1}
            >
              {l.text}
            </SvgText>
          );
        })}

        {/* ── 8. Glass cabinet text (tiny) ─────────────────────────────── */}
        {cabinetLabels.map((c, i) => (
          <SvgText
            key={`cabt-${i}`}
            x={c.x} y={c.y + fontSizeSm * 0.35}
            fontSize={fontSizeSm * 0.85}
            fill="#BF360C" textAnchor="middle"
            opacity={0.55}
          >
            Glass cabinet
          </SvgText>
        ))}

        {/* ── 9. Location destination dots ─────────────────────────────── */}
        {locations.map((loc, i) => {
          const isSelected = selectedDestination?.name === loc.name;
          const { border } = theme(loc.name);
          return (
            <G key={`loc-${i}`}>
              {isSelected && (
                <Circle
                  cx={loc.x} cy={loc.y}
                  r={rLocation * 2.2}
                  fill="#FF4444" opacity={0.15}
                />
              )}
              <Circle
                cx={loc.x} cy={loc.y} r={rLocation}
                fill={isSelected ? "#FF4444" : border}
                stroke="white" strokeWidth={2.5 * u}
              />
            </G>
          );
        })}

        {/* ── 10. Active navigation path ────────────────────────────────── */}
        {path.map((p, i) =>
          i < path.length - 1 ? (
            <Line
              key={`path-${i}`}
              x1={p.x} y1={p.y}
              x2={path[i + 1].x} y2={path[i + 1].y}
              stroke="#0066CC" strokeWidth={strokeNav}
              strokeDasharray={dashLen}
              strokeLinecap="round"
            />
          ) : null
        )}

        {/* ── 11. Destination pin ───────────────────────────────────────── */}
        {selectedDestination && (
          <G>
            <Circle
              cx={selectedDestination.x} cy={selectedDestination.y}
              r={rDest * 1.6}
              fill="#FF4444" opacity={0.2}
            />
            <Circle
              cx={selectedDestination.x} cy={selectedDestination.y}
              r={rDest}
              fill="#FF4444" stroke="white" strokeWidth={2.5 * u}
            />
          </G>
        )}

        {/* ── 12. User position dot ─────────────────────────────────────── */}
        {userPos && (
          <G>
            {/* Pulsing ring */}
            <Circle
              cx={userPos.x} cy={userPos.y}
              r={rUser * 2.4}
              fill="#0066CC" opacity={0.12}
            />
            <Circle
              cx={userPos.x} cy={userPos.y}
              r={rUser * 1.5}
              fill="#0066CC" opacity={0.2}
            />
            {/* Main dot */}
            <Circle
              cx={userPos.x} cy={userPos.y}
              r={rUser}
              fill="#0066CC" stroke="white" strokeWidth={3 * u}
            />
            {/* White center */}
            <Circle
              cx={userPos.x} cy={userPos.y}
              r={rUser * 0.38}
              fill="white"
            />
          </G>
        )}

        {/* ── 13. "Arrived" highlight ───────────────────────────────────── */}
        {arrived && selectedDestination && (
          <Circle
            cx={selectedDestination.x} cy={selectedDestination.y}
            r={rDest * 2.5}
            fill="none" stroke="#4CAF50"
            strokeWidth={4 * u} strokeDasharray={`${8 * u},${6 * u}`}
          />
        )}
      </Svg>
    </View>
  );
}
